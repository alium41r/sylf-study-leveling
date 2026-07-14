"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// This defines what a "Note" looks like so TypeScript doesn't yell at us
interface Note {
    id: number;
    title: string;
    content: string;
}

export default function NotesPage() {
    const [notes, setNotes] = useState<Note[]>([]);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [error, setError] = useState("");
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const router = useRouter();

    const fetchNotes = async () => {
        const response = await fetch("/api/notes");
        if (response.ok) {
            const data = await response.json();
            setNotes(data);
        }
    };

    // This runs as soon as the page loads to fetch all the notes!
    useEffect(() => {
        fetchNotes();
    }, []);

    const handleCreateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Grab the VIP pass we saved earlier!
        const token = localStorage.getItem("token");

        if (!token) {
            alert("You must be logged in to create a note!");
            router.push("/login");
            return;
        }

        // If we are editing, send a PUT request to /api/notes/[id]. Otherwise, POST to /api/notes
        const url = editingNoteId ? `/api/notes/${editingNoteId}` : "/api/notes";
        const method = editingNoteId ? "PUT" : "POST";

        const response = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ title, content }),
        });

        if (response.ok) {
            setTitle("");
            setContent("");
            setEditingNoteId(null); // Clear the editing state!
            fetchNotes(); // Refresh the list so the new note shows up!
        } else {
            const data = await response.json();
            setError(data.error || "Failed to create note");
        }
    };
    const handleEditClick = (note: Note) => {
        setEditingNoteId(note.id);
        setTitle(note.title);
        setContent(note.content);
        window.scrollTo({ top: 0, behavior: "smooth" }); // scroll back up to the form!
    };
    const handleDeleteNote = async (id: number) => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await fetch(`/api/notes/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
        });

        if (response.ok) {
            alert("Note deleted successfully!");
            fetchNotes(); // Refresh the list
        } else {
            const data = await response.json();
            alert(`Delete Failed: ${data.error}`);
        }
    };

    return (
        <div className="max-w-4xl mx-auto mt-10 p-6">
            <h1 className="text-3xl font-bold mb-8 text-white text-center">Notes Dashboard</h1>

            <div className="bg-gray-800 p-6 rounded-lg mb-10">
                <h2 className="text-xl font-semibold text-white mb-4">Create a New Note</h2>
                {error && <p className="text-red-400 mb-4">{error}</p>}

                <form onSubmit={handleCreateNote} className="flex flex-col gap-4">
                    <input
                        type="text" placeholder="Title" required
                        value={title} onChange={(e) => setTitle(e.target.value)}
                        className="p-2 rounded bg-gray-700 text-white"
                    />
                    <textarea
                        placeholder="Content" required
                        value={content} onChange={(e) => setContent(e.target.value)}
                        className="p-2 rounded bg-gray-700 text-white h-24"
                    ></textarea>
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white p-2 rounded transition-colors w-full sm:w-auto self-start">
                        Add Note
                    </button>
                </form>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {notes.length === 0 ? (
                    <p className="text-gray-400">No notes yet. Create one above!</p>
                ) : (
                    notes.map((note) => (
                        <div key={note.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <h3 className="text-xl font-bold text-white mb-2">{note.title}</h3>
                            <p className="text-gray-300 mb-4">{note.content}</p>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleEditClick(note)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
