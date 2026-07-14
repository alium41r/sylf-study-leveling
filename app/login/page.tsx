"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem("token", data.token);
            alert("Login successful!");
            router.push("/notes"); // Send them to the notes dashboard!
        } else {
            setError(data.error || "Login failed");
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-6 bg-gray-800 rounded-lg">
            <h1 className="text-2xl font-bold mb-6 text-white text-center">Log In</h1>

            {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <input
                    type="email" placeholder="Email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="p-2 rounded bg-gray-700 text-white"
                />
                <input
                    type="password" placeholder="Password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="p-2 rounded bg-gray-700 text-white"
                />

                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors mt-4">
                    Log In
                </button>
            </form>

            <p className="mt-4 text-center text-gray-400">
                Don't have an account? <Link href="/register" className="text-blue-400 hover:underline">Register here</Link>
            </p>
        </div>
    );
}
