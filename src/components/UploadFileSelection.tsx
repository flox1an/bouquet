import { Upload, AlertTriangle, Server as ServerIcon, Trash2 } from 'lucide-react';
import React, { ChangeEvent, DragEvent, useMemo, useRef } from 'react';
import CheckBox from './CheckBox/CheckBox';
import { Server } from '../utils/useUserServers';
import { formatFileSize } from '../utils/utils';
import { useServerInfo } from '../utils/useServerInfo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ResizeOptionType = {
  name: string;
  format?: string;
  width?: number;
  height?: number;
};

export const ResizeOptions: ResizeOptionType[] = [
  {
    name: 'Orignal Image',
    width: undefined,
    height: undefined,
  },
  {
    name: 'max. 1080x1080 pixels',
    width: 1080,
    height: 1080,
  },
  {
    name: 'max. 2048x2048 pixels',
    width: 2048,
    height: 2048,
  },
];

export type TransferStats = {
  enabled: boolean;
  size: number;
  transferred: number;
  rate: number;
  error?: string;
};

type UploadFileSelectionProps = {
  uploadBusy: boolean;
  servers: Server[];
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  clearTransfers: () => void;
  cleanPrivateData: boolean;
  setCleanPrivateData: React.Dispatch<React.SetStateAction<boolean>>;
  imageResize: number;
  setImageResize: React.Dispatch<React.SetStateAction<number>>;
  transfers: { [key: string]: { enabled: boolean; transferred: number; size: number; rate: number } };
  setTransfers: React.Dispatch<
    React.SetStateAction<{
      [key: string]: TransferStats;
    }>
  >;
  upload: () => void;
};

const UploadFileSelection: React.FC<UploadFileSelectionProps> = ({
  uploadBusy,
  servers,
  transfers,
  setTransfers,
  cleanPrivateData,
  setCleanPrivateData,
  imageResize,
  setImageResize,
  files,
  setFiles,
  clearTransfers,
  upload,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { serverInfo } = useServerInfo();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (uploadBusy) return;

    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    if (uploadBusy) return;
    event.preventDefault();

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles = Array.from(droppedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const sizeOfFilesToUpload = useMemo(() => files.reduce((acc, file) => (acc += file.size), 0), [files]);
  const imagesAreUploaded = useMemo(() => files.some(file => file.type.startsWith('image/')), [files]);
  const serversEnabledCount = useMemo(() => Object.values(transfers).filter(t => t.enabled).length, [transfers]);

  return (
    <>
      <input
        id="browse"
        type="file"
        ref={fileInputRef}
        disabled={uploadBusy}
        hidden
        multiple
        onChange={handleFileChange}
      />
      <label
        htmlFor="browse"
        className="p-12 bg-card rounded-lg hover:text-primary text-muted-foreground border-dashed border-border border-2 block cursor-pointer text-center"
        onDrop={handleDrop}
        onDragOver={event => event.preventDefault()}
      >
        <Upload className="w-8 h-8 inline" /> Browse or drag & drop
      </label>

      <div className="cursor-pointer gap-4 flex flex-col md:flex-row">
        <div className="flex flex-col gap-4 w-full md:w-1/2">
          <h3 className="text-lg text-muted-foreground">Servers</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: '2em auto' }}>
            {servers.map(s => (
              <CheckBox
                key={s.name}
                name={s.name}
                disabled={uploadBusy}
                checked={transfers[s.name]?.enabled || false}
                setChecked={c =>
                  setTransfers(ut => ({ ...ut, [s.name]: { enabled: c, transferred: 0, size: 0, rate: 0 } }))
                }
              >
                <ServerIcon className="w-6" />
                {s.name} <Badge variant="secondary">{serverInfo[s.name].type}</Badge>
              </CheckBox>
            ))}
          </div>
        </div>
        {imagesAreUploaded && (
          <div className="flex flex-col gap-4 w-full md:w-1/2">
            <h3 className="text-lg text-muted-foreground">Image Options</h3>
            <div className="cursor-pointer grid gap-2 items-center" style={{ gridTemplateColumns: '1.5em auto' }}>
              <CheckBox
                name="cleanData"
                disabled={uploadBusy}
                checked={cleanPrivateData}
                setChecked={c => setCleanPrivateData(c)}
              >
                Clean private data in images (EXIF)
              </CheckBox>
              <Checkbox
                id="resizeOption"
                disabled={uploadBusy}
                checked={imageResize > 0}
                onCheckedChange={() => setImageResize(irs => (irs > 0 ? 0 : 1))}
              />
              <div className="flex items-center gap-2">
                <label htmlFor="resizeOption" className="cursor-pointer select-none">
                  Resize Image
                </label>
                <Select
                  disabled={uploadBusy || imageResize == 0}
                  value={String(imageResize)}
                  onValueChange={(value) => setImageResize(Number(value))}
                >
                  <SelectTrigger className="w-[200px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ResizeOptions.map((ro, i) => (
                      <SelectItem key={ro.name} value={String(i)} disabled={i === 0}>
                        {ro.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>
      {serversEnabledCount == 1 && (
        <div className="text-sm flex flex-row gap-2 items-center text-yellow-600 dark:text-yellow-500">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>It's recommended to upload to multiple servers to ensure availability and censorship resistance.</span>
        </div>
      )}
      <div className="flex flex-row gap-2 justify-center md:justify-start">
        <Button
          onClick={() => upload()}
          disabled={serversEnabledCount < 1 || uploadBusy || files.length == 0}
        >
          <Upload className="w-4 h-4 mr-1" />
          Upload{files.length > 0 ? (files.length == 1 ? ` 1 file` : ` ${files.length} files`) : ''} /{' '}
          {formatFileSize(sizeOfFilesToUpload)}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          disabled={uploadBusy || files.length == 0}
          onClick={() => {
            clearTransfers();
            setFiles([]);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
};

export default UploadFileSelection;
