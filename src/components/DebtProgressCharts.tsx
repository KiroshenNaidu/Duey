'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { AppDataContext } from '@/context/AppDataContext';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { getProgress, getAmountPaid, getRemainingBalance } from '@/lib/calculations';

export function DebtProgressCharts() {
  const { debts, history } = useContext(AppDataContext);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const chartData = useMemo(() => {
    return debts.map((debt) => {
      return {
        name: debt.title,
        progress: Math.round(getProgress(debt, history)),
        paid: getAmountPaid(debt, history),
        remaining: getRemainingBalance(debt, history),
        total: debt.total_owed,
      };
    });
  }, [debts, history]);
  
  if (!isClient) {
    return <Skeleton className="h-[300px] w-full" />;
  }
  
  return (
     <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip
                    cursor={{ fill: 'hsl(var(--card))' }}
                    contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        borderColor: 'hsl(var(--border))',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                     formatter={(value, name, props) => {
                        if (name === 'progress') return [`${value}% Complete`, 'Progress'];
                        return [formatCurrency(Number(value)), name.charAt(0).toUpperCase() + name.slice(1)];
                    }}
                />
                <Bar dataKey="progress" fill="hsl(var(--primary))" background={{ fill: 'hsl(var(--muted))' }}>
                   <LabelList dataKey="progress" position="right" formatter={(value: number) => `${value}%`} fill="hsl(var(--foreground))"/>
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
  );
}
