import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton, TableSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Blocks' }]} />
      <div className="listhead">
        <Tic entity="block" iconSize={20} />
        <h1>Blocks</h1>
      </div>
      <div className="sumrow">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card sum" key={i}>
            <Skeleton width={90} height={11} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width={70} height={20} />
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </>
  );
}
