import { AddressPointer, EventPointer } from "nostr-tools/nip19"
import {
  KIND_BLOSSOM_DRIVE,
  KIND_FILE_META,
  KIND_PICTURE,
  KIND_SOCIAL_POST,
  KIND_VIDEO_HORIZONTAL,
  KIND_VIDEO_HORIZONTAL_IMMUTABLE,
  KIND_VIDEO_VERTICAL,
  KIND_VIDEO_VERTICAL_IMMUTABLE,
} from "../../utils/useFileMetaEvents"
import { nip19 } from "nostr-tools"
import type { NostrEvent } from "nostr-tools"
import { Badge as ShadcnBadge } from "@/components/ui/badge"

const Badge = ({ ev }: { ev: NostrEvent }) => {
  if (ev.kind == KIND_FILE_META) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer)
    return (
      <a target="_blank" href={`https://filestr.vercel.app/e/${nevent}`}>
        <ShadcnBadge className="mr-2">filemeta</ShadcnBadge>
      </a>
    )
  }

  if (ev.kind == KIND_BLOSSOM_DRIVE) {
    const driveIdentifier = ev.tags.find((t) => t[0] === "d")?.[1]
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: driveIdentifier || "",
      pubkey: ev.pubkey,
      relays: [],
    } as AddressPointer)
    return (
      <a
        target="_blank"
        href={`https://blossom.hzrd149.com/#/drive/${naddr}`}
        title={driveIdentifier}
      >
        <ShadcnBadge className="mr-2">drive</ShadcnBadge>
      </a>
    )
  }

  if (ev.kind == KIND_PICTURE) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer)
    return (
      <a target="_blank" href={`https://njump.me/${nevent}`}>
        <ShadcnBadge className="mr-2">picture</ShadcnBadge>
      </a>
    )
  }

  if (ev.kind == KIND_VIDEO_HORIZONTAL_IMMUTABLE || ev.kind == KIND_VIDEO_VERTICAL_IMMUTABLE) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer)
    return (
      <a target="_blank" href={`https://nostu.be/v/${nevent}`}>
        <ShadcnBadge className="mr-2">video</ShadcnBadge>
      </a>
    )
  }

  if (ev.kind == KIND_VIDEO_HORIZONTAL || ev.kind == KIND_VIDEO_VERTICAL) {
    const naddr = nip19.naddrEncode({
      kind: ev.kind,
      identifier: ev.tags.find((t) => t[0] === "d")?.[1] || "",
      pubkey: ev.pubkey,
      relays: [],
    } as AddressPointer)
    return (
      <a target="_blank" href={`https://nostu.be/v/${naddr}`}>
        <ShadcnBadge className="mr-2">video</ShadcnBadge>
      </a>
    )
  }

  if (ev.kind == KIND_SOCIAL_POST) {
    const nevent = nip19.neventEncode({
      kind: ev.kind,
      id: ev.id,
      author: ev.pubkey,
      relays: [],
    } as EventPointer)
    return (
      <a target="_blank" href={`https://njump.me/${nevent}`}>
        <ShadcnBadge className="mr-2">post</ShadcnBadge>
      </a>
    )
  }

  return <ShadcnBadge className="mr-2">{ev.kind}</ShadcnBadge>
}

export default Badge
