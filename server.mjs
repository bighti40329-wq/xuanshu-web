import express from "express";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";
const app=express();
const port=Number(process.env.PORT||3000);
const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
const ai=process.env.GEMINI_API_KEY?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}):null;
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:"256kb"}));
app.use(express.static("public",{extensions:["html"]}));
function payloadOf(body){return body?.payload&&typeof body.payload==="object"?body.payload:body}
function configOf(p){const s=p.generationConfig||{},c={responseMimeType:s.responseMimeType||"application/json"};if(p.systemInstruction)c.systemInstruction=typeof p.systemInstruction==="string"?p.systemInstruction:p.systemInstruction.parts?.map(x=>x.text).filter(Boolean).join("\n");for(const k of ["temperature","topP","topK","maxOutputTokens","stopSequences"])if(s[k]!==undefined)c[k]=s[k];if(s.responseSchema)c.responseJsonSchema=s.responseSchema;if(s.responseJsonSchema)c.responseJsonSchema=s.responseJsonSchema;return c}
function parse(text){if(!text?.trim())throw new Error("Gemini 回傳空白內容");return JSON.parse(text.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/,``))}
app.get("/api/health",(_q,res)=>res.json({ok:true,model,aiConfigured:Boolean(ai)}));
app.post("/api/ai/generate",async(req,res)=>{if(!ai)return res.status(503).json({code:"AI_NOT_CONFIGURED",message:"後端尚未設定 GEMINI_API_KEY"});const p=payloadOf(req.body);if(!Array.isArray(p?.contents)||!p.contents.length)return res.status(400).json({code:"INVALID_REQUEST",message:"缺少 contents"});try{console.log("Bazi AI request received",{model,hasSchema:Boolean(p.generationConfig?.responseSchema)});const r=await ai.models.generateContent({model,contents:p.contents,config:configOf(p)});return res.json({data:parse(r.text),model});}catch(e){const st=Number(e?.status||e?.code||0);console.error("Bazi AI request failed",{status:st,message:e?.message});if(st===429)return res.status(429).json({code:"AI_QUOTA_EXHAUSTED",message:"今日 Gemini API 額度已用完，請於配額重置後再試",detail:e?.message});if(st===400)return res.status(400).json({code:"GEMINI_INVALID_ARGUMENT",message:"Gemini 不接受目前的請求格式",detail:e?.message});if([401,403,404].includes(st))return res.status(502).json({code:"GEMINI_CONFIGURATION_ERROR",message:"Gemini 模型或金鑰設定錯誤",detail:e?.message});return res.status(502).json({code:"AI_UPSTREAM_ERROR",message:"Gemini API 暫時無法完成請求",detail:e?.message});}});
app.get(/^(?!\/api\/).*/,(_q,res)=>res.sendFile("index.html",{root:"public"}));
app.listen(port,"0.0.0.0",()=>console.log(`Xuanshu Bazi server on ${port}; model=${model}; configured=${Boolean(ai)}`));
