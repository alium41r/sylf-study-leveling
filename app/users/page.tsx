"use client";

import { useState, useEffect } from "react";

interface User {
  id: number;
  name: string;
  email: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Define the asynchronous fetch sequence
    const fetchUsers = async () => {
      try {
        const response = await fetch("https://jsonplaceholder.typicode.com/users");
        
        // Intercept non-200 HTTP status codes
        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        // Capture and store the network error
        setError(err instanceof Error ? err.message : "An unknown network error occurred.");
      } finally {
        // Terminate the loading state regardless of success or failure
        setLoading(false);
      }
    };

    fetchUsers();
  }, []); // Empty dependency array ensures this runs exactly once on mount

  if (loading) {
    return <div className="p-10 text-center text-gray-400 bg-black min-h-[calc(100vh-73px)]">Initiating network request...</div>;
  }

  if (error) {
    return <div className="p-10 text-center text-red-500 bg-black min-h-[calc(100vh-73px)]">Execution Failed: {error}</div>;
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] flex-col items-center p-6 bg-black text-white">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold mb-6 text-center">API Integration Test</h1>
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id} className="p-4 rounded border border-gray-800 bg-zinc-950 flex justify-between">
              <span className="font-semibold text-blue-400">{user.name}</span>
              <span className="text-gray-400 text-sm">{user.email}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}