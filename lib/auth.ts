import { jwtVerify } from "jose";

// This MUST match the exact same secret key we used to sign the token in login/route.ts!
const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "super-secret-key-12345");

export async function verifyToken(token: string) {
    try {
        // We use jwtVerify to check if the signature is valid and it hasn't expired
        const { payload } = await jwtVerify(token, secretKey);
        
        // If it succeeds, it returns the data we baked inside (userId and email)
        return payload; 
    } catch (error) {
        // If it fails (fake token, expired, etc.), return null
        return null; 
    }
}
