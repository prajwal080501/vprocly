import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import { NewSourcingTabs } from './new-sourcing-tabs';

export default async function NewSourcingPage() {
  const categories = await api<Category[]>('/categories');
  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit">Supplier matching</Badge>
          <CardTitle>New sourcing request</CardTitle>
          <CardDescription>Match items to suppliers by category and location, then invite them to bid.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewSourcingTabs categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
