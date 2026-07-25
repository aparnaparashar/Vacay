import React from "react";

interface ChatMessageProps {
  text: string;
  role?: "user" | "assistant";
}

const renderInlineFormatting = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

export function ChatMessageText({ text, role = "assistant" }: ChatMessageProps) {
  const lines = text.split("\n");
  const listBgClass = role === "user" ? "bg-white/10 border-white/20 text-inherit" : "bg-slate-50 border-slate-200/80 text-slate-700";

  return (
    <div className="space-y-3 text-sm leading-relaxed text-inherit">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={index} className="h-3" />;
        }

        const listMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        if (listMatch) {
          return (
            <div key={index} className={`flex items-start gap-3 rounded-2xl border p-3 shadow-sm ${listBgClass}`}>
              <span className="mt-0.5 text-primary">•</span>
              <span>{renderInlineFormatting(listMatch[1])}</span>
            </div>
          );
        }

        const labelMatch = trimmed.match(/^(\w[\w &]+):\s*(.*)$/);
        if (labelMatch && trimmed.length < 60) {
          return (
            <p key={index} className="font-semibold text-inherit">
              <span className="mr-1">{labelMatch[1]}:</span>
              <span className="font-normal text-inherit">{renderInlineFormatting(labelMatch[2])}</span>
            </p>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap break-words text-inherit">
            {renderInlineFormatting(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
