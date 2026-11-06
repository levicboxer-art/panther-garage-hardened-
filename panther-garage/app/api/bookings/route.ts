import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, invalidBodyResponse, rateLimit, rateLimitedResponse, readJson, requestKey } from "@/lib/api-security";
export const dynamic = "force-dynamic";
async function staff(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {supabase,response:NextResponse.json({error:"Unauthorized"},{status:401})};
 const {data:p}=await supabase.from("profiles").select("active,role").eq("id",user.id).single();
 if(!p?.active)return {supabase,response:NextResponse.json({error:"Forbidden"},{status:403})};
 return {supabase,response:null};
}
export async function GET(){const s=await staff();if(s.response)return s.response;const {data,error}=await s.supabase.from("service_bookings").select("id,booking_reference,customer_name,phone,email,motorcycle_make,motorcycle_model,registration_number,reported_issue,preferred_date,status,staff_note,created_at").order("created_at",{ascending:false}).limit(300);if(error)return dbErrorResponse(503);return NextResponse.json({bookings:data||[]});}
export async function POST(req:Request){
 const limited=rateLimit(requestKey(req,"booking"),5);if(!limited.allowed)return rateLimitedResponse(limited.retryAfter);
 let b:any;try{b=await readJson(req,32*1024)}catch(error){return invalidBodyResponse(error)}
 const customer_name=String(b.customer_name||"").trim(),phone=String(b.phone||"").trim(),motorcycle_make=String(b.motorcycle_make||"").trim(),reported_issue=String(b.reported_issue||"").trim();
 const email=String(b.email||"").trim(),model=String(b.motorcycle_model||"").trim(),registration=String(b.registration_number||"").trim();
 if(email.length>254||model.length>120||registration.length>40)return NextResponse.json({error:"Please check the length of the submitted details."},{status:400});
 if(customer_name.length<2||customer_name.length>120||phone.length<7||phone.length>30||!motorcycle_make||reported_issue.length<5||reported_issue.length>2000)return NextResponse.json({error:"Enter your name, a valid phone number, motorcycle make and a problem description (at least 5 characters)."},{status:400});
 const supabase=createAdminClient();const {data,error}=await supabase.from("service_bookings").insert({customer_name,phone,email:email||null,motorcycle_make,motorcycle_model:model||null,registration_number:registration||null,reported_issue,preferred_date:b.preferred_date||null,status:"PENDING",staff_note:null}).select("booking_reference,status,created_at").single();
 if(error)return dbErrorResponse(400);return NextResponse.json({booking:data},{status:201});
}
export async function PATCH(req:Request){const s=await staff();if(s.response)return s.response;let b:any;try{b=await readJson(req,32*1024)}catch(error){return invalidBodyResponse(error)}if(!b.id||!['CONFIRMED','DECLINED','CONVERTED','CANCELLED','PENDING'].includes(b.status))return NextResponse.json({error:"Choose a valid booking and status."},{status:400});const {error}=await s.supabase.from("service_bookings").update({status:b.status,staff_note:String(b.staff_note||"").trim()||null,updated_at:new Date().toISOString()}).eq("id",b.id);if(error)return dbErrorResponse(400);return NextResponse.json({message:"Booking updated."});}
