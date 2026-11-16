import express from "express";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
const app=express(), port=Number(process.env.PORT||3000), model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
const ai=process.env.GEMINI_API_KEY?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}):null;
const retryable=new Set([429,500,502,503,504]);
app.use(helmet({contentSecurityPolicy:false})); app.use(express.json({limit:"256kb"})); app.use(express.static("public",{extensions:["html"]}));
const RequestSchema=z.object({payload:z.object({contents:z.array(z.any()).min(1).max(8),systemInstruction:z.any().optional(),generationConfig:z.any().optional()}).strict()}).strict();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function generate(payload,tries=3){let wait=800;for(let i=0;i<=tries;i++){try{const r=await ai.models.generateContent({model,contents:payload.contents,config:{systemInstruction:payload.systemInstruction?.parts?.map(p=>p.text).join("\n"),responseMimeType:payload.generationConfig?.responseMimeType||"application/json",responseJsonSchema:payload.generationConfig?.responseSchema}});return JSON.parse(r.text)}catch(e){const status=Number(e?.status||e?.code||500);if(!retryable.has(status)||i===tries)throw e;await sleep(wait+Math.random()*250);wait*=2}}}
app.post("/api/ai/generate",async(req,res)=>{if(!ai)return res.status(503).json({code:"AI_NOT_CONFIGURED",message:"後端尚未設定 GEMINI_API_KEY"});const p=RequestSchema.safeParse(req.body);if(!p.success)return res.status(400).json({code:"INVALID_REQUEST",message:"請求格式不正確"});try{res.json({data:await generate(p.data.payload),model})}catch(e){const status=Number(e?.status||500);console.error("Gemini failed",{status,message:e?.message});res.status(retryable.has(status)?status:502).json({code:"AI_UPSTREAM_ERROR",message:"AI 服務暫時無法完成請求"})}});
app.get("/api/health",(_q,res)=>res.json({ok:true,model,aiConfigured:Boolean(ai)}));
app.listen(port,()=>console.log(`Xuanshu PWA: http://localhost:${port}`));
