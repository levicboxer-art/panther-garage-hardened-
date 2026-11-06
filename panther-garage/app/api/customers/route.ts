import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
async function staff(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return {supabase,user:null,response:NextResponse.json({error:"Unauthorized"},{status:401})};
  const {data:profile}=await supabase.from("profiles").select("active,role").eq("id",user.id).single();
  if(!profile?.active) return {supabase,user:null,response:NextResponse.json({error:"Forbidden"},{status:403})};
  return {supabase,user,response:null};
}
export async function GET(){
 const s=await staff(); if(s.response)return s.response;
 const {data,error}=await s.supabase.from("customers").select("id,full_name,phone,email,motorcycle_details,created_at").order("created_at",{ascending:false}).limit(250);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({customers:data||[]});
}
export async function POST(req:Request){
 const s=await staff(); if(s.response)return s.response;
 const b=await req.json(); const full_name=String(b.full_name||"").trim(); const phone=String(b.phone||"").trim();
 if(!full_name)return NextResponse.json({error:"Customer name is required."},{status:400});
 const {data,error}=await s.supabase.from("customers").insert({full_name,phone:phone||null,email:String(b.email||"").trim()||null,motorcycle_details:String(b.motorcycle_details||"").trim()||null,created_by:s.user!.id}).select().single();
 if(error)return NextResponse.json({error:error.code==="23505"?"A customer with this phone number already exists.":error.message},{status:400});
 return NextResponse.json({customer:data},{status:201});
}
