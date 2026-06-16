import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Params' }]} />
      <div className="listhead">
        <Tic entity="params" iconSize={20} />
        <h1>On-Chain Parameters</h1>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="card ns" key={i}>
          <div className="nh">
            <Skeleton width={90} height={14} />
          </div>
          <table className="ptbl">
            <tbody>
              {Array.from({ length: 3 }).map((_, j) => (
                <tr key={j}>
                  <td className="pk">
                    <Skeleton width="60%" />
                  </td>
                  <td className="pv">
                    <Skeleton width="40%" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
