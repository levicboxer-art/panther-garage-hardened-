import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { staffInventorySummary } from "@/lib/inventory-summary";
const dayStart=(d:string)=>`${d}T00:00:00.000Z`;
export async function GET(req:Request){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:profile}=await supabase.from("profiles").select("role,active").eq("id",user.id).single();
 if(!profile?.active)return NextResponse.json({error:"Forbidden"},{status:403});
 const u=new URL(req.url);const now=new Date();const to=u.searchParams.get("to")||now.toISOString().slice(0,10);const from=u.searchParams.get("from")||new Date(now.getTime()-29*86400000).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return NextResponse.json({error:"Choose a valid date range."},{status:400});
 const after=dayStart(from),before=new Date(new Date(dayStart(to)).getTime()+86400000).toISOString();
 const [sales,expenses,orders,invoices,jobs,products,stock,movements,staff]=await Promise.all([
  supabase.from("sales").select("id,invoice_number,total,amount_paid,balance_due,status,created_at,payment_method").gte("created_at",after).lt("created_at",before).order("created_at",{ascending:false}).limit(2000),
  supabase.from("garage_expenses").select("id,category,amount,status,expense_date").gte("expense_date",from).lte("expense_date",to).limit(2000),
  supabase.from("purchase_orders").select("id,subtotal,status,created_at").gte("created_at",after).lt("created_at",before).limit(2000),
  supabase.from("supplier_invoices").select("id,amount,paid_amount,status,due_date,created_at").gte("created_at",after).lt("created_at",before).limit(2000),
  supabase.from("repair_jobs").select("id,status,total_cost,received_at,completed_at").gte("received_at",after).lt("received_at",before).limit(2000),
  supabase.from("products").select("id,name,sku,minimum_stock,active"),
  staffInventorySummary(supabase),
  supabase.from("stock_movements").select("id,movement_type,quantity_delta,created_at").gte("created_at",after).lt("created_at",before).limit(3000),
  supabase.from("profiles").select("id,full_name,role,active,created_at").order("created_at",{ascending:false}).limit(200)
 ]);
 const failed=[sales,expenses,orders,invoices,jobs,products,movements,staff].find(x=>x.error);const problem=failed?.error;if(problem)return NextResponse.json({error:problem.message},{status:400});
 const completed=(sales.data||[]).filter(x=>x.status==="COMPLETED"),approved=(expenses.data||[]).filter(x=>x.status==="APPROVED");
 const stockMap=new Map(stock.map(x=>[x.product_id,Number(x.physical_stock||0)]));const active=(products.data||[]).filter(x=>x.active).map(p=>({...p,stock:stockMap.get(p.id)||0}));
 const lowStock=(p:any)=>p.stock<=Math.max(Number(p.minimum_stock||0),2);
 const data={period:{from,to},operations:{sales_count:completed.length,repairs_received:(jobs.data||[]).length,repairs_open:(jobs.data||[]).filter(x=>!['COLLECTED','CANCELLED'].includes(x.status)).length,repairs_completed:(jobs.data||[]).filter(x=>['READY','COLLECTED'].includes(x.status)).length,purchase_orders:(orders.data||[]).length,stock_movements:(movements.data||[]).length},inventory:{active_products:active.length,units_on_hand:active.reduce((n,p)=>n+p.stock,0),low_stock:active.filter(lowStock).length,low_stock_products:active.filter(lowStock).map(p=>({name:p.name,sku:p.sku,stock:p.stock,minimum_stock:p.minimum_stock}))},finance:profile.role==="BOSS"?{revenue:completed.reduce((n,x)=>n+Number(x.total),0),collected:completed.reduce((n,x)=>n+Number(x.amount_paid),0),customer_balance:completed.reduce((n,x)=>n+Number(x.balance_due),0),approved_expenses:approved.reduce((n,x)=>n+Number(x.amount),0),pending_expenses:(expenses.data||[]).filter(x=>x.status==="PENDING").reduce((n,x)=>n+Number(x.amount),0),purchase_order_value:(orders.data||[]).filter(x=>x.status!=="CANCELLED").reduce((n,x)=>n+Number(x.subtotal),0),supplier_invoice_outstanding:(invoices.data||[]).reduce((n,x)=>n+Math.max(0,Number(x.amount)-Number(x.paid_amount)),0)}:null,recent_sales:profile.role==="BOSS"?completed.slice(0,10):[],employees:profile.role==="BOSS"?staff.data||[]:[],sales_by_method:profile.role==="BOSS"?Object.entries(completed.reduce((a,x)=>{a[x.payment_method]=(a[x.payment_method]||0)+Number(x.total);return a},{} as Record<string,number>)).map(([method,total])=>({method,total})):[]};
 return NextResponse.json(data);
}
