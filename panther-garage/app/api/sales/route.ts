import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, invalidBodyResponse, readJson } from "@/lib/api-security";
async function staff(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {supabase,user:null,response:NextResponse.json({error:"Unauthorized"},{status:401})};
 const {data:p}=await supabase.from("profiles").select("active,role").eq("id",user.id).single();
 if(!p?.active)return {supabase,user:null,response:NextResponse.json({error:"Forbidden"},{status:403})};
 return {supabase,user,role:p.role,response:null};
}
export async function GET(){
 const s=await staff();if(s.response)return s.response;
 const {data,error}=await s.supabase.from("sales").select("id,invoice_number,status,payment_method,subtotal,discount,total,amount_paid,balance_due,created_at,customers(full_name,phone),sale_items(product_name,sku,quantity,unit_price,line_total)").order("created_at",{ascending:false}).limit(100);
 if(error)return dbErrorResponse(503);
 return NextResponse.json({sales:data||[]});
}
export async function POST(req:Request){
 const s=await staff();if(s.response)return s.response;
 if (!(s.role === "BOSS" || s.role === "EMPLOYEE")) return NextResponse.json({error:"You are not authorized to record sales."},{status:403});
 let b:any;try{b=await readJson(req,64*1024)}catch(error){return invalidBodyResponse(error)}
 if(!Array.isArray(b.items)||!b.items.length)return NextResponse.json({error:"Add at least one product."},{status:400});
 const items=b.items.map((x:any)=>({product_id:String(x.product_id||""),quantity:Number(x.quantity)}));
 if(items.length>100||items.some((x:any)=>!x.product_id||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>1000))return NextResponse.json({error:"Each item needs a product and positive whole quantity."},{status:400});
 const paid=Number(b.amount_paid);const discount=Number(b.discount||0);
 if(!["CASH","MOBILE_MONEY","BANK_TRANSFER","CARD","CREDIT"].includes(String(b.payment_method||"CASH").toUpperCase())||!Number.isFinite(paid)||paid<0||paid>100000000||!Number.isFinite(discount)||discount<0||discount>100000000)return NextResponse.json({error:"Enter valid payment and discount amounts."},{status:400});
 const {data,error}=await s.supabase.rpc("create_pos_sale",{p_customer_id:b.customer_id||null,p_items:items,p_payment_method:String(b.payment_method||"CASH").toUpperCase(),p_amount_paid:paid,p_discount:discount,p_notes:String(b.notes||"")||null});
 if(error)return dbErrorResponse(400);
 const {data:sale}=await s.supabase.from("sales").select("id,invoice_number,total,amount_paid,balance_due,created_at").eq("id",data).single();
 return NextResponse.json({sale,message:"Sale completed and stock deducted using FIFO."},{status:201});
}
