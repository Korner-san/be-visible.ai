import React from 'react';
import { CitationShareChart } from './citations/CitationShareChart';
import { CitationSourcesTable } from './citations/CitationSourcesTable';
import { AIPreferenceDistribution } from './citations/AIPreferenceDistribution';

interface CitationsPageProps {
  onNavigateToAcademy: (articleId: string) => void;
}

export const CitationsPage: React.FC<CitationsPageProps> = ({ onNavigateToAcademy }) => {
  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Combined Dashboard Row - Adjusted to 7/5 split for more distribution impact */}
      <div className="grid grid-cols-12 gap-6 items-stretch">
        <div className="col-span-12 lg:col-span-7 h-[340px]">
          <CitationShareChart />
        </div>
        <div className="col-span-12 lg:col-span-5 h-[340px]">
          <AIPreferenceDistribution />
        </div>
      </div>

      {/* Main Sources Table */}
      <div className="w-full">
        <CitationSourcesTable />
      </div>
    </div>
  );
};