import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Validators', href: '/validators' }, { label: '…' }]} />
      <div className="pagetitle">
        <Tic entity="validator" />
        <div>
          <h1>
            <Skeleton width={170} height={20} />
          </h1>
          <div className="hash">
            <Skeleton width={320} />
          </div>
        </div>
      </div>

      <div className="toprow">
        <div className="card balance">
          <Skeleton width={140} height={11} />
          <div style={{ marginTop: 12 }}>
            <Skeleton width={170} height={30} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Skeleton width={200} height={12} />
          </div>
        </div>
        <div className="card kv" style={{ paddingTop: 15 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="line" key={i}>
              <div className="k">
                <Skeleton width={120} />
              </div>
              <div className="v">
                <Skeleton width={`${40 + (i % 3) * 15}%`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
