import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { flushBossAlertEmail } from "@/lib/alert-delivery";
async function staff(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {supabase,user:null,response:NextResponse.json({error:"Unauthorized"},{status:401})};
  const {data:profile}=await supabase.from("profiles").select("active").eq("id",user.id).single();
  if(!profile?.active)return {supabase,user:null,response:NextResponse.json({error:"Forbidden"},{status:403})};
  return {supabase,user,response:null};
}
export async function GET(){
  const s=await staff(); if(s.response)return s.response;
  const [{data:jobs,error},{data:employees}] = await Promise.all([
    s.supabase.from("repair_jobs").select("id,job_number,customer_id,motorcycle_make,motorcycle_model,registration_number,reported_issue,diagnosis,status,labour_fee,parts_total,total_cost,received_at,completed_at,collected_at,customers(full_name,phone),repair_parts(product_name,sku,quantity,unit_price,line_total),repair_status_history(old_status,new_status,note,created_at),assigned:profiles!repair_jobs_assigned_to_fkey(full_name)").order("received_at",{ascending:false}).limit(200),
    s.supabase.from("profiles").select("id,full_name,role").eq("active",true).order("full_name")
  ]);
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({jobs:jobs||[],employees:employees||[]});
}
export async function POST(req:Request){
  const s=await staff(); if(s.response)return s.response;
  let b:any; try{b=await req.json()}catch{return NextResponse.json({error:"Invalid request body"},{status:400})}
  const make=String(b.motorcycle_make||"").trim(), issue=String(b.reported_issue||"").trim();
  const labour=Number(b.labour_fee||0); const parts=Array.isArray(b.parts)?b.parts.map((p:any)=>({product_id:String(p.product_id||""),quantity:Number(p.quantity)})):[];
  if(!make||!issue)return NextResponse.json({error:"Motorcycle make and reported problem are required."},{status:400});
  if(!Number.isFinite(labour)||labour<0||parts.some((p:any)=>!p.product_id||!Number.isInteger(p.quantity)||p.quantity<1))return NextResponse.json({error:"Check labour fee and spare-part quantities."},{status:400});
  const {data,error}=await s.supabase.rpc("create_repair_job",{
    p_customer_id:b.customer_id||null,p_motorcycle_make:make,p_motorcycle_model:String(b.motorcycle_model||""),p_registration_number:String(b.registration_number||""),p_reported_issue:issue,p_assigned_to:b.assigned_to||null,p_labour_fee:labour,p_parts:parts,p_notes:String(b.notes||"")
  });
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {data:job}=await s.supabase.from("repair_jobs").select("id,job_number,status,total_cost,received_at").eq("id",data).single();
  await flushBossAlertEmail();
  return NextResponse.json({job,message:"Repair job created and selected spare parts deducted from FIFO stock."},{status:201});
}
export async function PATCH(req:Request){
  const s=await staff(); if(s.response)return s.response;
  let b:any; try{b=await req.json()}catch{return NextResponse.json({error:"Invalid request body"},{status:400})}
  if(!b.id||!b.status)return NextResponse.json({error:"Job and new status are required."},{status:400});
  const {error}=await s.supabase.rpc("update_repair_status",{p_job_id:b.id,p_status:String(b.status),p_diagnosis:String(b.diagnosis||""),p_note:String(b.note||"")});
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({message:"Repair status updated."});
}
