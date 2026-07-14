"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    // useRouter allows us to redirect the user to a different page (like /login)
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // YOUR TURN: What is the URL for the Backend Registration API we built yesterday?
        // Hint: It starts with "/api/..."
        const backendUrl = "/api/auth/register";

        const response = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });

        if (response.ok) {
            alert("Registration successful! Please log in.");
            router.push("/login"); // Send them to the login page!
        } else {
            const data = await response.json();
            setError(data.error || "Registration failed");
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-6 bg-gray-800 rounded-lg">
            <h1 className="text-2xl font-bold mb-6 text-white text-center">Register</h1>

            {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

            <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <input
                    type="text" placeholder="Name" required
                    value={name} onChange={(e) => setName(e.target.value)}
                    className="p-2 rounded bg-gray-700 text-white"
                />
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
                    Register
                </button>
            </form>

            <p className="mt-4 text-center text-gray-400">
                Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
            </p>
        </div>
    );
}
