import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { TableSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Validators' }]} />
      <div className="listhead">
        <Tic entity="validator" iconSize={20} />
        <h1>Validators</h1>
      </div>
      <div className="card">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </>
  );
}
