"use client";

import { useState } from "react";

interface FormData {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

export default function Contact() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState<boolean>(false);

  const validateForm = (): boolean => {
    const activeErrors: FormErrors = {};

    if (!formData.name.trim()) {
      activeErrors.name = "Name field is required.";
    }

    if (!formData.email.trim()) {
      activeErrors.email = "Email field is required.";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      activeErrors.email = "Please enter a valid email format.";
    }

    if (!formData.message.trim()) {
      activeErrors.message = "Message field cannot be empty.";
    } else if (formData.message.length < 10) {
      activeErrors.message = "Message must be at least 10 characters long.";
    }

    setErrors(activeErrors);
    return Object.keys(activeErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validateForm()) {
      setSubmitted(true);
      setFormData({ name: "", email: "", message: "" });
      setErrors({});
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-73px)] flex-col items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-md p-8 rounded-xl border border-gray-800 bg-zinc-950">
        <h1 className="text-3xl font-bold mb-6 text-center">Contact Form</h1>

        {submitted && (
          <div className="p-4 mb-4 rounded bg-emerald-950/50 border border-emerald-500 text-emerald-400 text-sm text-center font-medium">
            Form verified and submitted successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-400">
              Name
            </label>
            <input
              type="text"
              className="w-full p-2.5 rounded bg-zinc-900 border border-gray-800 focus:border-blue-500 focus:outline-none text-white transition-colors"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1.5 font-medium">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-400">
              Email Address
            </label>
            <input
              type="email"
              className="w-full p-2.5 rounded bg-zinc-900 border border-gray-800 focus:border-blue-500 focus:outline-none text-white transition-colors"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1.5 font-medium">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-400">
              Message
            </label>
            <textarea
              rows={4}
              className="w-full p-2.5 rounded bg-zinc-900 border border-gray-800 focus:border-blue-500 focus:outline-none text-white transition-colors resize-none"
              value={formData.message}
              onChange={(e) =>
                setFormData({ ...formData, message: e.target.value })
              }
            />
            {errors.message && (
              <p className="text-red-500 text-xs mt-1.5 font-medium">
                {errors.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 mt-2 rounded bg-blue-600 hover:bg-blue-700 transition-colors font-semibold text-white cursor-pointer"
          >
            Submit Form
          </button>
        </form>
      </div>
    </main>
  );
}
