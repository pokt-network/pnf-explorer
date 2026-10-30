import { KvSkeleton, Skeleton } from '@/components/ui/states';

// Shared skeleton for the archive's detail pages: title, hash line and the key/value card.
export default function Loading() {
  return (
    <>
      <div className="crumb">
        <Skeleton width={200} height={12} />
      </div>
      <div className="pagetitle">
        <Skeleton width={46} height={46} />
        <div>
          <h1>
            <Skeleton width={180} height={20} />
          </h1>
          <div className="hash">
            <Skeleton width={320} />
          </div>
        </div>
      </div>
      <KvSkeleton rows={9} />
    </>
  );
}
