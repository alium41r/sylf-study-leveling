import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Contact from '../app/contact/page';

describe('Contact Form Component', () => {
  // Test 1: DOM Rendering Verification
  it('renders all form input fields and the submit button', () => {
    render(<Contact />);
    
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Form/i })).toBeInTheDocument();
  });

  // Test 2: State Hook Tracking Verification
  it('updates input values sequentially when the user types', () => {
    render(<Contact />);
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    
    fireEvent.change(nameInput, { target: { value: 'Test Data' } });
    
    expect(nameInput.value).toBe('Test Data');
  });

  // Test 3: Client-Side Validation Logic Verification
  it('blocks submission and displays validation errors for empty fields', () => {
    render(<Contact />);
    const submitButton = screen.getByRole('button', { name: /Submit Form/i });
    
    // Simulate a click without filling any data
    fireEvent.click(submitButton);
    
    // Verify the state hooks output the correct error strings to the UI
    expect(screen.getByText('Name field is required.')).toBeInTheDocument();
    expect(screen.getByText('Email field is required.')).toBeInTheDocument();
    expect(screen.getByText('Message field cannot be empty.')).toBeInTheDocument();
  });
});