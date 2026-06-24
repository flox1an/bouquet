import { useEffect } from 'react';
import { extractDomain, formatFileSize } from '../../utils/utils';
import { getProxyUrl } from '../../utils/imageProxy';
import { fetchId3Tag } from '../../utils/id3';
import useVideoThumbnailDvm from './dvm';
import TagInput from '../TagInput';
import { allGenres } from '../../utils/genres';
import { Server, Clipboard, Loader2 } from 'lucide-react';
import MimeTypeIcon from '../MimeTypeIcon';
import type { NostrEvent } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FileEventData = {
  originalFile: File;
  content: string;
  url: string[];
  width?: number;
  height?: number;
  dim?: string;
  x: string;
  m?: string;
  size: number;
  thumbnails?: string[];
  selectedThumbnail?: string;
  publishedThumbnail?: string;
  blurHash?: string;
  tags: string[];
  duration?: string;

  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  subgenre?: string;

  publish: {
    file?: boolean;
    audio?: boolean;
    video?: boolean;
  };
  events: NostrEvent[];
};

const copyToClipboard = (text: string) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {})
    .catch(err => {
      console.error('Failed to copy: ', err);
    });
};

const FileEventEditor = ({
  fileEventData,
  setFileEventData,
}: {
  fileEventData: FileEventData;
  setFileEventData: (fe: FileEventData) => void;
}) => {
  const { createDvmThumbnailRequest, thumbnailRequestEventId } = useVideoThumbnailDvm(fileEventData, setFileEventData);

  const isAudio = fileEventData.m?.startsWith('audio/');
  const isVideo = fileEventData.m?.startsWith('video/');
  const isImage = fileEventData.m?.startsWith('image/');

  useEffect(() => {
    if (isVideo && fileEventData.thumbnails == undefined) {
      createDvmThumbnailRequest(fileEventData);
    }
    if (
      fileEventData.m?.startsWith('audio/') &&
      !(
        fileEventData.title ||
        fileEventData.artist ||
        fileEventData.album ||
        fileEventData.year ||
        fileEventData.publishedThumbnail
      )
    ) {
      console.log('getting id3 cover image', fileEventData.x, fileEventData.url[0], fileEventData.originalFile);
      fetchId3Tag(fileEventData.x, fileEventData.url[0], fileEventData.originalFile).then(res => {
        if (!res) return;

        const { id3 } = res;
        console.log(res.coverFull);
        setFileEventData({
          ...fileEventData,
          artist: id3.artist,
          album: id3.album,
          title: id3.title,
          year: id3.year,
          thumbnails: res.coverFull ? [res.coverFull] : [],
          selectedThumbnail: res.coverFull,
        });
      });
    }
  }, [fileEventData]);

  useEffect(() => {
    if (fileEventData.selectedThumbnail == undefined) {
      if (fileEventData.thumbnails && fileEventData.thumbnails?.length > 0) {
        setFileEventData({
          ...fileEventData,
          selectedThumbnail: fileEventData.thumbnails[0],
        });
      }
    }
  }, [fileEventData.thumbnails, fileEventData.selectedThumbnail]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left column: Publish options */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Publish Options</h3>

            {fileEventData.publish.file !== undefined && (
              <div className="flex items-center gap-3">
                <Switch
                  id="publish-file"
                  checked={fileEventData.publish.file}
                  onCheckedChange={(checked) =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, file: checked },
                    })
                  }
                />
                <Label htmlFor="publish-file" className="cursor-pointer">
                  Publish file metadata event
                </Label>
              </div>
            )}

            {fileEventData.publish.video !== undefined && (
              <div className="flex items-center gap-3">
                <Switch
                  id="publish-video"
                  checked={fileEventData.publish.video}
                  onCheckedChange={(checked) =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, video: checked },
                    })
                  }
                />
                <Label htmlFor="publish-video" className="cursor-pointer">
                  Publish video event
                </Label>
              </div>
            )}

            {fileEventData.publish.audio !== undefined && (
              <div className="flex items-center gap-3">
                <Switch
                  id="publish-audio"
                  checked={fileEventData.publish.audio}
                  onCheckedChange={(checked) =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, audio: checked },
                    })
                  }
                />
                <Label htmlFor="publish-audio" className="cursor-pointer">
                  Publish audio event
                </Label>
              </div>
            )}
          </div>

          {/* Thumbnail section for video */}
          {fileEventData.m?.startsWith('video/') && thumbnailRequestEventId && (
            <div className="w-full lg:w-64 shrink-0">
              {fileEventData.thumbnails && fileEventData.thumbnails.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Thumbnail</h3>
                  <div className="rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={getProxyUrl(fileEventData.selectedThumbnail || fileEventData.thumbnails[0])}
                      className="w-full aspect-video object-cover"
                      alt="Selected thumbnail"
                    />
                  </div>
                  <div className="flex justify-center gap-2">
                    {fileEventData.thumbnails.map((t, i) => (
                      <Button
                        key={`thumb-${i}`}
                        size="sm"
                        variant={t === fileEventData.selectedThumbnail ? 'default' : 'outline'}
                        onClick={() => setFileEventData({ ...fileEventData, selectedThumbnail: t })}
                      >
                        {i + 1}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating previews...</span>
                </div>
              )}
            </div>
          )}

          {/* Thumbnail section for image/audio */}
          {(isImage || isAudio) && (fileEventData.publishedThumbnail || fileEventData.selectedThumbnail) && (
            <div className="w-full lg:w-64 shrink-0">
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Preview</h3>
                <div className="rounded-lg overflow-hidden border bg-muted p-4">
                  <img
                    src={
                      fileEventData.publishedThumbnail
                        ? getProxyUrl(fileEventData.publishedThumbnail)
                        : fileEventData.selectedThumbnail
                    }
                    className="w-full rounded"
                    alt="Preview"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Right column: Metadata form */}
          <div className="flex-1 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Metadata</h3>

            {(isAudio || isVideo) && (
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={fileEventData.title || ''}
                  onChange={e => setFileEventData({ ...fileEventData, title: e.target.value })}
                  placeholder="Enter title"
                />
              </div>
            )}

            {isAudio && fileEventData.artist && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Artist</span>
                  <p className="font-medium">{fileEventData.artist}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Album</span>
                  <p className="font-medium">{fileEventData.album || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Year</span>
                  <p className="font-medium">{fileEventData.year || '—'}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Summary / Description</Label>
              <Textarea
                id="description"
                value={fileEventData.content}
                onChange={e => setFileEventData({ ...fileEventData, content: e.target.value })}
                placeholder="Add a caption or description"
                rows={3}
              />
            </div>

            {isAudio && (
              <div className="space-y-2">
                <Label>Genre</Label>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={fileEventData.genre || ''}
                    onValueChange={(value) => setFileEventData({ ...fileEventData, genre: value, subgenre: '' })}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(allGenres).map(g => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={fileEventData.subgenre || ''}
                    disabled={
                      !fileEventData.genre ||
                      !allGenres[fileEventData.genre] ||
                      allGenres[fileEventData.genre].length === 0
                    }
                    onValueChange={(value) => setFileEventData({ ...fileEventData, subgenre: value })}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Sub-genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {fileEventData.genre &&
                        allGenres[fileEventData.genre]?.map(g => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput
                tags={fileEventData.tags}
                setTags={(tags: string[]) => setFileEventData({ ...fileEventData, tags })}
              />
            </div>

            {/* File info grid */}
            <div className="pt-4 border-t space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">File Info</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium flex items-center gap-2">
                    <MimeTypeIcon className="h-4 w-4" type={fileEventData.m} />
                    {fileEventData.m}
                  </p>
                </div>

                <div>
                  <span className="text-muted-foreground">Size</span>
                  <p className="font-medium">{fileEventData.size ? formatFileSize(fileEventData.size) : 'Unknown'}</p>
                </div>

                {fileEventData.dim && (
                  <div>
                    <span className="text-muted-foreground">Dimensions</span>
                    <p className="font-medium">{fileEventData.dim}</p>
                  </div>
                )}
              </div>

              <div>
                <span className="text-sm text-muted-foreground">URLs</span>
                <div className="mt-1 space-y-1">
                  {fileEventData.url.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <a href={url} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                        {extractDomain(url)}
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(url)}
                        title="Copy to clipboard"
                      >
                        <Clipboard className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileEventEditor;
