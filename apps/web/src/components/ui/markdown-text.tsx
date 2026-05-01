'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

export const MARKDOWN_INPUT_HINT =
  'Markdown is supported. You will see raw syntax here and formatted text on cards.';

const previewComponents: Components = {
  p: ({ children }) => <>{children}</>,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => (
    <span className="after:text-muted-foreground after:content-[' • '] last:after:content-none">
      {children}
    </span>
  ),
};

interface MarkdownTextProps {
  markdown: string;
  className?: string;
  variant?: 'default' | 'preview';
}

export function MarkdownText({ markdown, className, variant = 'default' }: MarkdownTextProps) {
  const trimmed = markdown.trim();

  if (!trimmed) return null;

  return (
    <div
      className={cn(
        'break-words [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:bg-muted/70 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:m-0 [&_p+p]:mt-2 [&_pre]:bg-muted/70 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={variant === 'preview' ? previewComponents : undefined}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, ''),
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '')
    .replace(/[~*_]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}