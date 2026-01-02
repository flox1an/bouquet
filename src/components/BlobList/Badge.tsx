import { AddressPointer, EventPointer } from 'nostr-tools/nip19';
import {
  KIND_BLOSSOM_DRIVE,
  KIND_FILE_META,
  KIND_SOCIAL_POST,
  KIND_VIDEO_HORIZONTAL,
  KIND_VIDEO_VERTICAL,
} from '../../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from 'nostr-tools';

const Badge = ({ ev }: { ev: NostrEvent }) => {
  if (ev.kind == KIND_FILE_META) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer);
    return (
      <a target="_blank" href={`https://filestr.vercel.app/e/${nevent}`}>
        <div className="badge badge-primary mr-2">filemeta</div>
      </a>
    );
  }

  if (ev.kind == KIND_BLOSSOM_DRIVE) {
    const driveIdentifier = ev.tags.find(t => t[0] === 'd')?.[1];
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: driveIdentifier || '',
      pubkey: ev.pubkey,
      relays: [],
    } as AddressPointer);
    return (
      <a
        target="_blank"
        className="badge badge-primary mr-2 tooltip"
        href={`https://blossom.hzrd149.com/#/drive/${naddr}`}
        data-tip={driveIdentifier}
      >
        drive
      </a>
    );
  }

  if (ev.kind == KIND_VIDEO_HORIZONTAL || ev.kind == KIND_VIDEO_VERTICAL) {
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: ev.tags.find(t => t[0] === 'd')?.[1] || '',
      pubkey: ev.pubkey,
      relays: [],
    } as AddressPointer);
    return (
      <a target="_blank" className="badge badge-primary mr-2" href={`https://www.flare.pub/w/${naddr}`}>
        video
      </a>
    );
  }

  if (ev.kind == KIND_SOCIAL_POST) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer);
    return (
      <a target="_blank" href={`https://njump.me/${nevent}`}>
        <div className="badge badge-primary mr-2">post</div>
      </a>
    );
  }

  return <span className="badge badge-primary mr-2">{ev.kind}</span>;
};

export default Badge;
