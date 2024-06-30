import { AddressPointer } from 'nostr-tools/nip19';
import {
  KIND_BLOSSOM_DRIVE,
  KIND_FILE_META,
  KIND_SOCIAL_POST,
  KIND_VIDEO_HORIZONTAL,
  KIND_VIDEO_VERTICAL,
} from '../../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { EventPointer, NDKEvent } from '@nostr-dev-kit/ndk';

const Badge = ({ ev }: { ev: NDKEvent }) => {
  if (ev.kind == KIND_FILE_META) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
    } as EventPointer);
    return (
      <a target="_blank" href={`https://filestr.vercel.app/e/${nevent}`}>
        <div className="badge badge-primary mr-2">filemeta</div>
      </a>
    );
  }

  if (ev.kind == KIND_BLOSSOM_DRIVE) {
    const driveIdentifier = ev.tagValue('d');
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: driveIdentifier,
      pubkey: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
    } as AddressPointer);
    return (
      <a
        target="_blank"
        className="badge badge-primary mr-2 tooltip"
        href={`https://blossom.hzrd149.com/#/drive/${naddr}`}
        data-tip={driveIdentifier}
      >
        🌸 drive
      </a>
    );
  }

  if (ev.kind == KIND_VIDEO_HORIZONTAL || ev.kind == KIND_VIDEO_VERTICAL) {
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: ev.tagValue('d'),
      pubkey: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
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
      author: ev.author.pubkey,
      relays: ev.onRelays.map(r => r.url),
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
