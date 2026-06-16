import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton, TableSkeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Transactions' }]} />
      <div className="listhead">
        <Tic entity="tx" iconSize={20} />
        <h1>Transactions</h1>
      </div>
      <div className="sumrow c3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="card sum" key={i}>
            <Skeleton width={120} height={11} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width={70} height={20} />
            </div>
          </div>
        ))}
      </div>
      <div className="chips">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={64} height={30} />
        ))}
      </div>
      <div className="card">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </>
  );
}
