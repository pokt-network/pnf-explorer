import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { KvSkeleton, Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Blocks', href: '/blocks' }, { label: '…' }]} />
      <div className="pagetitle">
        <Tic entity="block" />
        <div>
          <h1>
            <Skeleton width={160} height={20} />
          </h1>
          <div className="hash">
            <Skeleton width={280} />
          </div>
        </div>
      </div>
      <KvSkeleton rows={11} />
    </>
  );
}
