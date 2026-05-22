import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

type Step = {
  label: string;
};

type StepsProps = {
  steps: Step[];
  currentStep: number;
  className?: string;
};

export function Steps({ steps, currentStep, className }: StepsProps) {
  return (
    <div className={cn('flex items-center justify-center py-2 md:py-3', className)}>
      <div className="inline-flex items-center rounded-lg border bg-muted p-0.5">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <div
              key={index}
                className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
                isCompleted && 'text-muted-foreground',
                isCurrent && 'bg-background text-foreground shadow-sm',
                isUpcoming && 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground',
                  isUpcoming && 'bg-muted-foreground/30 text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
