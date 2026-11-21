import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";
import { flushBossAlertEmail } from "@/lib/alert-delivery";
import { staffInventorySummary } from "@/lib/inventory-summary";
async function staff(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {supabase,user:null,response:NextResponse.json({error:"Unauthorized"},{status:401})};
 const {data:p}=await supabase.from("profiles").select("active,role").eq("id",user.id).single();
 if(!p?.active)return {supabase,user:null,response:NextResponse.json({error:"Forbidden"},{status:403})};
 return {supabase,user,role:p.role,response:null};
}
export async function GET(){
 const s=await staff();if(s.response)return s.response;
 const isBoss=s.role==="BOSS";
 const itemFields=isBoss
  ? "product_id,product_name,sku,quantity,unit_price,unit_cost,line_total"
  : "product_id,product_name,sku,quantity,unit_price,line_total";
 const [salesResult,stockResult]=await Promise.all([
  s.supabase.from("sales").select(`id,invoice_number,status,payment_method,subtotal,discount,total,amount_paid,balance_due,created_at,customers(full_name,phone),sale_items(${itemFields})`).eq("status", "COMPLETED").order("created_at",{ascending:false}).limit(100),
  staffInventorySummary(s.supabase).catch(error=>{
   console.error("Could not load current stock for invoice details",error);
   return [];
  }),
 ]);
 const {data,error}=salesResult;
 if(error)return dbErrorResponse(503,error);
 const stockByProduct=new Map(stockResult.map(row=>[row.product_id,row.physical_stock]));
 const sales=(data||[]).map((sale:any)=>{
  const lineItems=sale.sale_items||[];
  const subtotal=Number(sale.subtotal)||0;
  const discount=Number(sale.discount)||0;
  return {
   ...sale,
   sale_items:lineItems.map((item:any)=>{
    const quantity=Number(item.quantity)||0;
    const lineTotal=Number(item.line_total)||0;
    const allocatedDiscount=subtotal>0?Math.round((discount*lineTotal/subtotal)*100)/100:0;
    const result={
     ...item,
     quantity,
     unit_price:Number(item.unit_price)||0,
     line_total:lineTotal,
     current_stock:stockByProduct.get(item.product_id)??null,
     effective_unit_price:quantity>0?(lineTotal-allocatedDiscount)/quantity:0,
    } as Record<string,unknown>;
    if(isBoss){
     const unitCost=Number(item.unit_cost)||0;
     result.unit_cost=unitCost;
     result.gross_profit=Math.round((lineTotal-allocatedDiscount-unitCost*quantity)*100)/100;
    }
    return result;
   }),
  };
 });
 return NextResponse.json({sales,is_boss:isBoss});
}
export async function POST(req:Request){
 const s=await staff();if(s.response)return s.response;
 if (!(s.role === "BOSS" || s.role === "EMPLOYEE")) return NextResponse.json({error:"You are not authorized to record sales."},{status:403});
 let b:any;try{b=await readJson(req,64*1024)}catch(error){return invalidBodyResponse(error)}
 if(!Array.isArray(b.items)||!b.items.length)return NextResponse.json({error:"Add at least one product."},{status:400});
 const items=b.items.map((x:any)=>({product_id:String(x.product_id||""),quantity:Number(x.quantity),...(x.unit_price===undefined?{}:{unit_price:Number(x.unit_price)})}));
 if(items.length>100||items.some((x:any)=>!x.product_id||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>1000||("unit_price" in x&&(!Number.isFinite(x.unit_price)||x.unit_price<=0||x.unit_price>100000000))))return NextResponse.json({error:"Each item needs a product, positive whole quantity, and valid sale price."},{status:400});
 const paid=Number(b.amount_paid);const discount=Number(b.discount||0);
 if(!["CASH","MOBILE_MONEY","BANK_TRANSFER","CARD","CREDIT"].includes(String(b.payment_method||"CASH").toUpperCase())||!Number.isFinite(paid)||paid<0||paid>100000000||!Number.isFinite(discount)||discount<0||discount>100000000)return NextResponse.json({error:"Enter valid payment and discount amounts."},{status:400});
 const {data,error}=await s.supabase.rpc("create_pos_sale",{p_customer_id:b.customer_id||null,p_items:items,p_payment_method:String(b.payment_method||"CASH").toUpperCase(),p_amount_paid:paid,p_discount:discount,p_notes:String(b.notes||"")||null});
 if(error)return dbErrorResponse(400,error);
 const {data:sale}=await s.supabase.from("sales").select("id,invoice_number,total,amount_paid,balance_due,created_at").eq("id",data).single();
 await flushBossAlertEmail();
 return NextResponse.json({sale,message:"Sale completed and stock deducted using FIFO."},{status:201});
}
