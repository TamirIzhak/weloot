import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { cn } from './cn';

export type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'label' | 'caption';
export type TextTone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' | 'success';

const VARIANT: Record<TextVariant, string> = {
  title: 'font-black text-[28px] leading-[34px]',
  heading: 'font-bold text-[22px] leading-[28px]',
  subheading: 'font-medium text-[18px] leading-[24px]',
  body: 'font-sans text-[16px] leading-[24px]',
  label: 'font-medium text-[14px] leading-[20px]',
  caption: 'font-sans text-[13px] leading-[18px]',
};

const TONE: Record<TextTone, string> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
  accent: 'text-accent',
  danger: 'text-danger',
  success: 'text-success',
};

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  className?: string;
};

/** App text: Rubik in every language, with the PRD §3.2 type scale. Alignment follows the layout direction. */
export function Text({ variant = 'body', tone = 'primary', className, ...props }: TextProps) {
  const role = variant === 'title' || variant === 'heading' ? 'header' : undefined;
  return (
    <RNText
      accessibilityRole={role}
      className={cn(VARIANT[variant], TONE[tone], 'text-start', className)}
      {...props}
    />
  );
}
