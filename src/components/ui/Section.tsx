
import React from 'react';

interface SectionProps {
    title: string;
    description: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export const Section: React.FC<SectionProps> = ({ title, description, children, defaultOpen = true }) => (
    <details className="bg-slate-800/50 rounded-xl shadow-lg open:mb-6 transition-all duration-300 group" open={defaultOpen}>
        <summary className="p-6 cursor-pointer text-xl font-bold text-sky-400 list-none flex justify-between items-center outline-none">
            <div>
                <h3 className="text-xl font-bold text-sky-400 group-hover:text-sky-300 transition-colors">{title}</h3>
                <p className="text-sm text-slate-400 font-normal mt-1">{description}</p>
            </div>
            <svg className="w-6 h-6 text-slate-400 transform transition-transform duration-300 group-open:rotate-180" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
        </summary>
        <div className="p-6 pt-0 space-y-4 border-t border-slate-700/50 mt-2">
            {children}
        </div>
    </details>
);
