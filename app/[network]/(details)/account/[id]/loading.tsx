import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Accounts', href: '/accounts' }, { label: '…' }]} />
      <div className="pagetitle">
        <Tic entity="account" />
        <div>
          <h1>
            <Skeleton width={130} height={20} />
          </h1>
          <div className="hash">
            <Skeleton width={300} />
          </div>
        </div>
      </div>

      <div className="toprow">
        <div className="card balance">
          <Skeleton width={70} height={11} />
          <div style={{ marginTop: 12 }}>
            <Skeleton width={180} height={30} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Skeleton width={200} height={12} />
          </div>
        </div>
        <div className="card kv" style={{ paddingTop: 15 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="line" key={i}>
              <div className="k">
                <Skeleton width={90} />
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
