import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/states';

// Skeleton for the role-organised address page: title, the role rail, then a stat row + detail
// card. The rail width is a guess (the held roles aren't known until the profile resolves), so it
// renders two placeholder cards — enough to reserve the row without implying a specific role count.
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

      <div className="rolerail">
        {Array.from({ length: 2 }).map((_, i) => (
          <div className="rolecard" key={i}>
            <Skeleton width={30} height={30} />
            <span className="rl">
              <Skeleton width={78} height={12} />
              <div style={{ marginTop: 4 }}>
                <Skeleton width={54} height={10} />
              </div>
            </span>
          </div>
        ))}
      </div>

      <div className="sumrow">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card sum" key={i}>
            <Skeleton width={80} height={11} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width={110} height={20} />
            </div>
          </div>
        ))}
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
    </>
  );
}
