import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: "Hello"
    });
    console.log("1.5 Pro works:", res.text);
  } catch(e: any) { console.log("1.5 Pro error:", e.message); }
  
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: "Hello"
    });
    console.log("1.5 Flash works:", res.text);
  } catch(e: any) { console.log("1.5 Flash error:", e.message); }
}
test();
