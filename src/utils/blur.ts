import { encode } from 'blurhash';

const loadImage = async (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (...args) => reject(args);
    img.src = src;
  });

const getImageData = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context) {
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  }
};

function getFileDataURL(file: File): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = function (event) {
      if (event.target) {
        const dataURL = event.target.result;
        resolve(dataURL);
      }
      reject();
    };

    reader.onerror = function (error) {
      reject(error);
    };
  });
}

export async function getBlurhashAndSizeFromFile(file: File) {
  const imageUrl = await getFileDataURL(file);
  if (imageUrl) {
    const image = await loadImage(imageUrl?.toString());
    const imageData = getImageData(image);
    return {
      width: image.width,
      height: image.height,
      blurHash: imageData && encode(imageData.data, imageData.width, imageData.height, 4, 3),
    };
  }
}
