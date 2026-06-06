import Link from 'next/link';
import { ProposerLink } from '@/components/blocks/ProposerLink';
import { BlockIcon } from '@/components/ui/Icons';
import { getBlockList } from '@/lib/data/blocks';
import { formatNumber, formatBlockTime } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';

// Latest 10 blocks panel (home). Reuses the verified blockList fetch.
export async function RecentBlocks() {
  const { nodes } = await getBlockList(10, 0);
  return (
    <div className="card panel">
      <div className="head">
        <h2>
          <span className="hicon" style={{ background: 'rgba(2,90,242,.12)' }}>
            <BlockIcon size={14} stroke="var(--blue-soft)" />
          </span>
          Latest Blocks
        </h2>
        <Link className="viewall" href="/blocks">
          View all →
        </Link>
      </div>
      {nodes.map((b) => (
        <div className="row" key={b.height}>
          <div className="ic">Bk</div>
          <div className="mid">
            <div className="top">
              <Link href={`/block/${b.height}`}>{formatNumber(b.height)}</Link>
              <span className="age" title={absoluteUtc(b.timestamp)}>
                {relativeTime(b.timestamp)}
              </span>
            </div>
            <div className="btm">
              Proposer <ProposerLink address={b.proposerAddress} />
            </div>
          </div>
          <div className="end">
            <div className="amt">
              {formatNumber(b.totalTxs)}
              <span className="u">txns</span>
            </div>
            <div className="btm" style={{ justifyContent: 'flex-end', fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: 5 }}>
              {formatBlockTime(b.timeToBlock)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
