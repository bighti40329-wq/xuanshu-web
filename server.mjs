import express from "express";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";
const app=express();
const port=Number(process.env.PORT||3000);
const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
const ai=process.env.GEMINI_API_KEY?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}):null;
const retryable=new Set([429,500,502,503,504]);
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:"512kb"}));
app.use(express.static("public",{extensions:["html"]}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const statusOf=e=>Number(e?.status||e?.code||0);
function payloadOf(body){return body?.payload&&typeof body.payload==="object"?body.payload:body}
function configOf(p){const s=p.generationConfig||{},c={responseMimeType:s.responseMimeType||"application/json"};const si=p.systemInstruction;if(si)c.systemInstruction=typeof si==="string"?si:si.parts?.map(x=>x.text).filter(Boolean).join("\n");for(const k of ["temperature","topP","topK","maxOutputTokens","stopSequences"])if(s[k]!==undefined)c[k]=s[k];if(s.responseSchema)c.responseJsonSchema=s.responseSchema;if(s.responseJsonSchema)c.responseJsonSchema=s.responseJsonSchema;return c}
function parseText(text){if(!text?.trim())throw new Error("Gemini 回傳空白內容");return JSON.parse(text.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/,``))}
async function generate(p,maxRetries=1){let wait=900;for(let i=0;i<=maxRetries;i++){try{const r=await ai.models.generateContent({model,contents:p.contents,config:configOf(p)});return parseText(r.text)}catch(e){const st=statusOf(e);if(!retryable.has(st)||i===maxRetries)throw e;await sleep(wait);wait*=2}}}
app.get("/api/health",(_q,res)=>res.json({ok:true,model,aiConfigured:Boolean(ai)}));
app.post("/api/ai/generate",async(req,res)=>{if(!ai)return res.status(503).json({code:"AI_NOT_CONFIGURED",message:"後端尚未設定 GEMINI_API_KEY"});const p=payloadOf(req.body);if(!Array.isArray(p?.contents)||!p.contents.length)return res.status(400).json({code:"INVALID_REQUEST",message:"缺少 contents"});try{console.log("AI request received",{model,contentCount:p.contents.length,hasResponseSchema:Boolean(p.generationConfig?.responseSchema||p.generationConfig?.responseJsonSchema)});res.json({data:await generate(p),model})}catch(e){const st=statusOf(e);console.error("Gemini request failed",{status:st,name:e?.name,message:e?.message});if(st===400)return res.status(400).json({code:"GEMINI_INVALID_ARGUMENT",message:"Gemini 不接受目前的請求格式或 JSON Schema",detail:e?.message});if([401,403,404].includes(st))return res.status(502).json({code:"GEMINI_CONFIGURATION_ERROR",message:"Gemini 模型或金鑰設定錯誤",detail:e?.message});if(st===429)return res.status(429).json({code:"GEMINI_RATE_LIMIT",message:"Gemini 配額已達限制"});res.status(502).json({code:"AI_UPSTREAM_ERROR",message:"Gemini API 暫時無法完成請求",detail:e?.message})}});
app.get(/^(?!\/api\/).*/,(_q,res)=>res.sendFile("index.html",{root:"public"}));
app.listen(port,"0.0.0.0",()=>console.log(`Xuanshu server running on port ${port}; model=${model}; configured=${Boolean(ai)}`));
