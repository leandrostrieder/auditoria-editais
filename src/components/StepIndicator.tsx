
import React from 'react';

interface StepIndicatorProps {
  currentStep: number;
}

const steps = [
  { id: 1, label: 'Edital Base' },
  { id: 2, label: 'Laudos de Originalidade' },
  { id: 3, label: 'Ordens de Serviço' },
  { id: 4, label: 'Validação e Geração' }
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  return (
    <div className="flex items-center justify-between mb-8 w-full max-w-4xl mx-auto">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
              currentStep >= step.id 
              ? 'bg-blue-600 text-white border-2 border-blue-600 shadow-lg shadow-blue-200' 
              : 'bg-white text-slate-400 border-2 border-slate-200'
            }`}>
              {step.id}
            </div>
            <span className={`text-xs mt-2 font-medium ${currentStep >= step.id ? 'text-blue-600' : 'text-slate-400'}`}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-4 -mt-6 ${currentStep > step.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
