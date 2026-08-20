"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  evaluateMath,
  AngleMode,
  formatResultNumber,
  calcFactorial,
  calcPermutation,
  calcCombination,
} from "@/lib/calculator/math-engine";
import {
  Copy,
  Check,
  History,
  RotateCcw,
  Delete,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";

export interface CalcHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

// Re-export evaluateMathExpression for backward compatibility and test suites
export function evaluateMathExpression(
  rawExpr: string,
  angleMode: "DEG" | "RAD" = "DEG"
): { success: boolean; result: string; error?: string } {
  const res = evaluateMath(rawExpr, angleMode);
  return { success: res.success, result: res.result, error: res.error };
}

export default function CalculatorTool() {
  const [expression, setExpression] = useState<string>("");
  const [result, setResult] = useState<string>("0");
  const [ansValue, setAnsValue] = useState<number>(0);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [isSecond, setIsSecond] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [history, setHistory] = useState<CalcHistoryItem[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [hasEvaluated, setHasEvaluated] = useState<boolean>(false);

  const displayRef = useRef<HTMLDivElement>(null);

  // Load history & Ans from localStorage
  useEffect(() => {
    try {
      const savedTape = localStorage.getItem("scholar_calc_tape");
      if (savedTape) {
        const parsed = JSON.parse(savedTape);
        setHistory(parsed);
        if (parsed.length > 0 && !isNaN(Number(parsed[0].result))) {
          setAnsValue(Number(parsed[0].result));
        }
      }
    } catch {}
  }, []);

  const persistHistory = (newItems: CalcHistoryItem[]) => {
    setHistory(newItems);
    try {
      localStorage.setItem("scholar_calc_tape", JSON.stringify(newItems.slice(0, 30)));
    } catch {}
  };

  // Real-time live preview evaluation (Desmos style)
  const livePreview = useMemo(() => {
    if (!expression || hasEvaluated) return null;
    const evalRes = evaluateMath(expression, angleMode, ansValue);
    if (evalRes.success) {
      return evalRes.result;
    }
    return null;
  }, [expression, angleMode, ansValue, hasEvaluated]);

  // Execute Calculation (=)
  const calculate = useCallback(() => {
    if (!expression) return;

    const evalRes = evaluateMath(expression, angleMode, ansValue);
    if (evalRes.success) {
      setResult(evalRes.result);
      if (evalRes.numericValue !== undefined && !isNaN(evalRes.numericValue)) {
        setAnsValue(evalRes.numericValue);
      }
      setHasEvaluated(true);

      const newItem: CalcHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        expression,
        result: evalRes.result,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      persistHistory([newItem, ...history.slice(0, 29)]);
    } else {
      setResult(evalRes.result);
      setHasEvaluated(true);
    }
  }, [expression, angleMode, ansValue, history]);

  // Input insertion helpers
  const appendText = useCallback((str: string) => {
    setExpression((prev) => {
      // If we just evaluated and user types a digit or function, start new expression
      if (hasEvaluated) {
        setHasEvaluated(false);
        // If user typed an operator, continue with Ans
        if (["+", "−", "×", "÷", "^", "%"].includes(str)) {
          return `Ans ${str} `;
        }
        return str;
      }
      return prev + str;
    });
  }, [hasEvaluated]);

  const handleDigit = useCallback((digit: string) => {
    setExpression((prev) => {
      if (hasEvaluated) {
        setHasEvaluated(false);
        return digit;
      }
      return prev + digit;
    });
  }, [hasEvaluated]);

  const handleDecimal = useCallback(() => {
    setExpression((prev) => {
      if (hasEvaluated) {
        setHasEvaluated(false);
        return "0.";
      }
      // Check last number token for existing decimal
      const tokens = prev.split(/[\s+\−×÷\(\)\^,]/);
      const lastToken = tokens[tokens.length - 1];
      if (lastToken && lastToken.includes(".")) {
        return prev;
      }
      if (!prev || /[\s+\−×÷\(\)\^,]$/.test(prev)) {
        return prev + "0.";
      }
      return prev + ".";
    });
  }, [hasEvaluated]);

  const handleOperator = useCallback((op: string) => {
    setExpression((prev) => {
      if (hasEvaluated) {
        setHasEvaluated(false);
        return `Ans ${op} `;
      }
      if (!prev) {
        if (op === "−") return "-";
        return `0 ${op} `;
      }
      // Replace trailing operator if exists
      const trimmed = prev.trimEnd();
      if (/[+−×÷\^%]$/.test(trimmed)) {
        return `${trimmed.slice(0, -1)}${op} `;
      }
      return `${trimmed} ${op} `;
    });
  }, [hasEvaluated]);

  const handleClear = useCallback(() => {
    setExpression("");
    setResult("0");
    setHasEvaluated(false);
  }, []);

  const handleBackspace = useCallback(() => {
    setExpression((prev) => {
      if (hasEvaluated) {
        setHasEvaluated(false);
        return "";
      }
      if (!prev) return "";
      // If ends with function like "sin(" or "sqrt(", remove full function name
      const funcMatch = prev.match(/([a-zA-Z0-9_]+)\($/);
      if (funcMatch) {
        return prev.slice(0, -funcMatch[0].length);
      }
      // If ends with spaced operator e.g. " + ", remove operator
      if (/\s[+−×÷\^%]\s$/.test(prev)) {
        return prev.slice(0, -3);
      }
      return prev.slice(0, -1);
    });
  }, [hasEvaluated]);

  const handleToggleSign = useCallback(() => {
    setExpression((prev) => {
      if (!prev || prev === "0") return "-";
      if (prev.startsWith("-")) return prev.slice(1);
      return `-${prev}`;
    });
  }, []);

  const handleFunction = useCallback((func: string) => {
    setHasEvaluated(false);
    switch (func) {
      case "sq":
        setExpression((prev) => (prev ? `${prev}^2` : "0^2"));
        break;
      case "cube":
        setExpression((prev) => (prev ? `${prev}^3` : "0^3"));
        break;
      case "inv":
        setExpression((prev) => (prev ? `1/(${prev})` : "1/("));
        break;
      case "fact":
        setExpression((prev) => `${prev}!`);
        break;
      case "pct":
        setExpression((prev) => `${prev}%`);
        break;
      case "exp":
        setExpression((prev) => (prev ? `${prev}^` : "10^"));
        break;
      case "pow":
        setExpression((prev) => (prev ? `${prev}^` : "^"));
        break;
      case "e_pow":
        setExpression((prev) => (prev ? `${prev}*e^` : "e^"));
        break;
      case "ten_pow":
        setExpression((prev) => (prev ? `${prev}*10^` : "10^"));
        break;
      case "nPr":
        setExpression((prev) => `${prev} nPr `);
        break;
      case "nCr":
        setExpression((prev) => `${prev} nCr `);
        break;
      default:
        // Standard function call: func + "("
        setExpression((prev) => (prev && !/[\s+\−×÷\(\^,]$/.test(prev) ? `${prev}*${func}(` : `${prev}${func}(`));
        break;
    }
  }, []);

  const handleInsertConstant = useCallback((c: string) => {
    setHasEvaluated(false);
    setExpression((prev) => (prev && !/[\s+\−×÷\(\^,]$/.test(prev) ? `${prev}*${c}` : `${prev}${c}`));
  }, []);

  const handleCopy = useCallback(() => {
    const textToCopy = hasEvaluated ? result : (livePreview || expression || "0");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [hasEvaluated, result, livePreview, expression]);

  const handleUseHistoryItem = (item: CalcHistoryItem, type: "result" | "formula") => {
    if (type === "result") {
      setExpression((prev) => prev + item.result);
    } else {
      setExpression(item.expression);
      setResult(item.result);
      setHasEvaluated(true);
    }
    setShowHistory(false);
  };

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === ".") {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === "+") {
        e.preventDefault();
        handleOperator("+");
      } else if (e.key === "-") {
        e.preventDefault();
        handleOperator("−");
      } else if (e.key === "*") {
        e.preventDefault();
        handleOperator("×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleOperator("÷");
      } else if (e.key === "^") {
        e.preventDefault();
        appendText("^");
      } else if (e.key === "(" || e.key === ")") {
        e.preventDefault();
        appendText(e.key);
      } else if (e.key === "!") {
        e.preventDefault();
        handleFunction("fact");
      } else if (e.key === "%") {
        e.preventDefault();
        handleFunction("pct");
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        calculate();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Delete" || (e.key === "c" && e.ctrlKey)) {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDigit, handleDecimal, handleOperator, appendText, handleFunction, calculate, handleBackspace, handleClear]);

  return (
    <div className="flex flex-col text-text-primary select-none font-sans text-xs bg-bg-void/40">
      {/* ─── Mode & Utility Header Ribbon ─── */}
      <div className="px-3 py-2 bg-bg-abyss border-b border-border-subtle flex items-center justify-between gap-2 shadow-sm">
        {/* Left Toggles: DEG/RAD, 2nd */}
        <div className="flex items-center gap-1.5">
          {/* Angle Mode Toggle */}
          <button
            onClick={() => setAngleMode((m) => (m === "DEG" ? "RAD" : "DEG"))}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider transition-all ${
              angleMode === "DEG"
                ? "bg-accent-primary text-white shadow-sm"
                : "bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle"
            }`}
            title="Toggle Angle Mode (Degrees / Radians)"
          >
            {angleMode}
          </button>

          {/* 2nd Function Toggle */}
          <button
            onClick={() => setIsSecond(!isSecond)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider transition-all ${
              isSecond
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle"
            }`}
            title="Toggle Inverse / Alternate Scientific Functions"
          >
            2nd
          </button>
        </div>

        {/* Right Tools: Copy, History */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-bg-panel hover:bg-bg-shadow text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
            title="Copy Result to Clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg border transition-all ${
              showHistory
                ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                : "bg-bg-panel hover:bg-bg-shadow text-text-secondary hover:text-text-primary border border-border-subtle"
            }`}
            title="Toggle Calculation Tape History"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Desmos-Style Dual-Line Screen Display ─── */}
      <div
        ref={displayRef}
        className="px-3.5 py-2 bg-bg-abyss/90 border-b border-border-subtle flex flex-col justify-end min-h-[72px] max-h-[88px] overflow-hidden"
      >
        {/* Top Expression Line (Scrollable) */}
        <div
          data-testid="calc-expression"
          className="text-right text-xs font-mono text-text-muted overflow-x-auto no-scrollbar whitespace-nowrap min-h-[16px]"
        >
          {expression || <span className="opacity-40">0</span>}
        </div>

        {/* Bottom Result / Live Preview Line */}
        <div className="flex items-baseline justify-end gap-2 overflow-x-auto no-scrollbar mt-0.5">
          {livePreview && !hasEvaluated && (
            <span className="text-xs font-mono text-accent-text-light/70 tracking-wide">
              = {livePreview}
            </span>
          )}
          <span
            data-testid="calc-display"
            className="text-2xl font-bold font-mono tracking-tight text-text-primary select-text"
            style={{ fontFamily: "'Rajdhani', monospace" }}
          >
            {hasEvaluated ? result : (livePreview || "0")}
          </span>
        </div>
      </div>

      {/* ─── Main Content Area: Keypad or History ─── */}
      {showHistory ? (
        /* History Slide-Out Drawer */
        <div className="flex-1 p-3 bg-bg-abyss/90 overflow-y-auto custom-scrollbar flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-border-subtle text-text-muted text-[11px]">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-accent-primary" />
              <span>Calculation Tape ({history.length})</span>
            </span>
            {history.length > 0 && (
              <button
                onClick={() => persistHistory([])}
                className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No calculation history recorded yet.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-bg-panel/60 border border-border-subtle hover:border-accent-primary-mid transition-all flex flex-col gap-1"
              >
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{item.timestamp}</span>
                  <span className="font-mono">{item.expression} =</span>
                </div>
                <div className="text-sm font-mono font-bold text-accent-text-light select-text">
                  {item.result}
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border-subtle/40">
                  <button
                    onClick={() => {
                      setExpression(item.expression);
                      setHasEvaluated(false);
                      setShowHistory(false);
                    }}
                    className="px-2 py-0.5 rounded bg-bg-abyss text-[10px] text-text-muted hover:text-text-primary border border-border-subtle"
                  >
                    Restore Formula
                  </button>
                  <button
                    onClick={() => {
                      appendText(item.result);
                      setShowHistory(false);
                    }}
                    className="px-2 py-0.5 rounded bg-accent-primary text-[10px] text-white"
                  >
                    Use Result
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Standard Ergonomic Scientific Keypad */
        <div className="p-2.5 flex flex-col gap-1.5">
          {/* ─── Upper Deck: Advanced Functions (5 Columns) ─── */}
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-bg-panel/40 border border-border-subtle/60 shadow-inner">
            {/* Function Row 1: Trig & Hyperbolic */}
            <button
              onClick={() => handleFunction(isSecond ? "asin" : "sin")}
              className="btn-calc-sci"
              title={isSecond ? "Arcsine (asin)" : "Sine (sin)"}
            >
              {isSecond ? "sin⁻¹" : "sin"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "acos" : "cos")}
              className="btn-calc-sci"
              title={isSecond ? "Arccosine (acos)" : "Cosine (cos)"}
            >
              {isSecond ? "cos⁻¹" : "cos"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "atan" : "tan")}
              className="btn-calc-sci"
              title={isSecond ? "Arctangent (atan)" : "Tangent (tan)"}
            >
              {isSecond ? "tan⁻¹" : "tan"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "asinh" : "sinh")}
              className="btn-calc-sci"
              title={isSecond ? "Inverse Hyperbolic Sine" : "Hyperbolic Sine"}
            >
              {isSecond ? "sinh⁻¹" : "sinh"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "acosh" : "cosh")}
              className="btn-calc-sci"
              title={isSecond ? "Inverse Hyperbolic Cosine" : "Hyperbolic Cosine"}
            >
              {isSecond ? "cosh⁻¹" : "cosh"}
            </button>

            {/* Function Row 2: Powers & Radicals */}
            <button
              onClick={() => handleFunction(isSecond ? "cbrt" : "sqrt")}
              className="btn-calc-sci"
              title={isSecond ? "Cube Root (∛x)" : "Square Root (√x)"}
            >
              {isSecond ? "∛x" : "√x"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "cube" : "sq")}
              className="btn-calc-sci"
              title={isSecond ? "Cube (x³)" : "Square (x²)"}
            >
              {isSecond ? "x³" : "x²"}
            </button>
            <button
              onClick={() => handleFunction("pow")}
              className="btn-calc-sci"
              title="Power (xʸ)"
            >
              xʸ
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "e_pow" : "ln")}
              className="btn-calc-sci"
              title={isSecond ? "e to the power of x (eˣ)" : "Natural Logarithm (ln)"}
            >
              {isSecond ? "eˣ" : "ln"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "ten_pow" : "log10")}
              className="btn-calc-sci"
              title={isSecond ? "10 to the power of x (10ˣ)" : "Logarithm Base 10 (log₁₀)"}
            >
              {isSecond ? "10ˣ" : "log"}
            </button>

            {/* Function Row 3: Combinatorics, Constants, Discrete */}
            <button
              onClick={() => handleFunction(isSecond ? "nPr" : "fact")}
              className="btn-calc-sci"
              title={isSecond ? "Permutations (nPr)" : "Factorial (n!)"}
            >
              {isSecond ? "nPr" : "n!"}
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "pct" : "nCr")}
              className="btn-calc-sci"
              title={isSecond ? "Percentage (%)" : "Combinations (nCr)"}
            >
              {isSecond ? "%" : "nCr"}
            </button>
            <button
              onClick={() => handleInsertConstant(isSecond ? "tau" : "pi")}
              className="btn-calc-sci font-serif"
              title={isSecond ? "Tau constant (τ = 2π)" : "Pi constant (π)"}
            >
              {isSecond ? "τ" : "π"}
            </button>
            <button
              onClick={() => handleInsertConstant("e")}
              className="btn-calc-sci font-serif"
              title="Euler's number (e ≈ 2.718)"
            >
              e
            </button>
            <button
              onClick={() => handleFunction(isSecond ? "inv" : "abs")}
              className="btn-calc-sci"
              title={isSecond ? "Reciprocal (1/x)" : "Absolute Value (|x|)"}
            >
              {isSecond ? "1/x" : "|x|"}
            </button>
          </div>

          {/* ─── Lower Deck: Standard 10-Key Numpad (4 Columns) ─── */}
          <div className="grid grid-cols-4 gap-1.5">
            {/* Numpad Row 1: Clear, Delete, Parentheses */}
            <button
              onClick={handleClear}
              className="btn-calc-action text-red-400 font-bold hover:bg-red-500/20"
              title="All Clear (AC)"
            >
              AC
            </button>
            <button
              onClick={handleBackspace}
              className="btn-calc-action hover:bg-bg-panel"
              title="Backspace (DEL)"
            >
              <Delete className="w-4 h-4 mx-auto" />
            </button>
            <button
              onClick={() => appendText("(")}
              className="btn-calc-action"
              title="Open Parenthesis"
            >
              (
            </button>
            <button
              onClick={() => appendText(")")}
              className="btn-calc-action"
              title="Close Parenthesis"
            >
              )
            </button>

            {/* Numpad Row 2: 7, 8, 9, ÷ */}
            <button onClick={() => handleDigit("7")} className="btn-calc-num">
              7
            </button>
            <button onClick={() => handleDigit("8")} className="btn-calc-num">
              8
            </button>
            <button onClick={() => handleDigit("9")} className="btn-calc-num">
              9
            </button>
            <button onClick={() => handleOperator("÷")} className="btn-calc-op">
              ÷
            </button>

            {/* Numpad Row 3: 4, 5, 6, × */}
            <button onClick={() => handleDigit("4")} className="btn-calc-num">
              4
            </button>
            <button onClick={() => handleDigit("5")} className="btn-calc-num">
              5
            </button>
            <button onClick={() => handleDigit("6")} className="btn-calc-num">
              6
            </button>
            <button onClick={() => handleOperator("×")} className="btn-calc-op">
              ×
            </button>

            {/* Numpad Row 4: 1, 2, 3, − */}
            <button onClick={() => handleDigit("1")} className="btn-calc-num">
              1
            </button>
            <button onClick={() => handleDigit("2")} className="btn-calc-num">
              2
            </button>
            <button onClick={() => handleDigit("3")} className="btn-calc-num">
              3
            </button>
            <button onClick={() => handleOperator("−")} className="btn-calc-op">
              −
            </button>

            {/* Numpad Row 5: 0, ., Ans / ±, = */}
            <button onClick={() => handleDigit("0")} className="btn-calc-num">
              0
            </button>
            <button onClick={handleDecimal} className="btn-calc-num font-bold">
              .
            </button>
            <button
              onClick={() => appendText("Ans")}
              className="btn-calc-action font-mono font-bold text-accent-text-light"
              title="Previous Result Recall (Ans)"
            >
              Ans
            </button>
            <button onClick={() => handleOperator("+")} className="btn-calc-op">
              +
            </button>

            {/* Accentuated Equal Key (Spans Full Width of Bottom Strip) */}
            <button
              onClick={handleToggleSign}
              className="btn-calc-action"
              title="Toggle Positive / Negative (±)"
            >
              ±
            </button>
            <button
              onClick={calculate}
              className="btn-calc-equal col-span-3 font-bold"
              title="Evaluate Calculation (=)"
            >
              =
            </button>
          </div>
        </div>
      )}

      {/* Styled utilities for Casio/Desmos Ergonomics */}
      <style>{`
        .btn-calc-num {
          padding: 0.44rem 0.25rem;
          background: var(--bg-abyss);
          border: 1px solid var(--border-subtle);
          border-radius: 0.55rem;
          font-family: "Rajdhani", monospace;
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--text-primary);
          transition: all 0.12s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .btn-calc-num:hover {
          background: var(--bg-shadow);
          border-color: var(--accent-primary-mid);
          transform: translateY(-1px);
        }
        .btn-calc-num:active {
          transform: translateY(1px);
        }
        .btn-calc-op {
          padding: 0.44rem 0.25rem;
          background: var(--accent-primary-dim);
          border: 1px solid var(--accent-primary-mid);
          border-radius: 0.55rem;
          font-family: "Rajdhani", monospace;
          font-weight: 700;
          font-size: 1.15rem;
          color: var(--accent-text-light);
          transition: all 0.12s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-calc-op:hover {
          background: var(--accent-primary);
          color: white;
          transform: translateY(-1px);
        }
        .btn-calc-action {
          padding: 0.44rem 0.25rem;
          background: var(--bg-abyss);
          border: 1px solid var(--border-subtle);
          border-radius: 0.55rem;
          font-family: "Rajdhani", monospace;
          font-weight: 600;
          font-size: 0.88rem;
          color: var(--text-secondary);
          transition: all 0.12s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-calc-action:hover {
          background: var(--bg-panel);
          color: var(--text-primary);
        }
        .btn-calc-sci {
          padding: 0.35rem 0.12rem;
          background: var(--bg-abyss);
          border: 1px solid var(--border-subtle);
          border-radius: 0.45rem;
          font-family: "Rajdhani", monospace;
          font-weight: 600;
          font-size: 0.8rem;
          color: var(--text-secondary);
          transition: all 0.12s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-calc-sci:hover {
          background: var(--accent-primary-dim);
          color: var(--accent-text-light);
          border-color: var(--accent-primary-mid);
          transform: translateY(-1px);
        }
        .btn-calc-equal {
          padding: 0.5rem 0.35rem;
          background: var(--accent-primary);
          border: 1px solid var(--accent-primary-light);
          border-radius: 0.55rem;
          font-family: "Rajdhani", monospace;
          font-weight: 700;
          font-size: 1.25rem;
          color: white;
          box-shadow: 0 4px 14px var(--accent-primary-dim);
          transition: all 0.12s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-calc-equal:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .btn-calc-equal:active {
          transform: translateY(1px);
        }
      `}</style>
    </div>
  );
}
