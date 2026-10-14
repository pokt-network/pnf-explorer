import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton, TableSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Morse Migration' }]} />
      <div className="listhead">
        <Tic entity="account" iconSize={20} />
        <h1>Morse Migration</h1>
      </div>
      <div className="sumrow">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card sum" key={i}>
            <Skeleton width={120} height={11} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width={70} height={20} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Skeleton height={6} />
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
