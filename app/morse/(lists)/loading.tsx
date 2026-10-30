import { Skeleton, TableSkeleton } from '@/components/ui/states';

// Shared skeleton for the archive's lists: a header, four summary cards and the table.
export default function Loading() {
  return (
    <>
      <div className="crumb">
        <Skeleton width={160} height={12} />
      </div>
      <div className="listhead">
        <Skeleton width={40} height={40} />
        <Skeleton width={140} height={20} />
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
