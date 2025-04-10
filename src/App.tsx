import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, AlertCircle, Trash2, Archive, Settings } from 'lucide-react';
import JSZip from 'jszip';

interface FileWithPreview {
  file: File;
  preview: string;
  optimized: boolean;
}

interface IconSize {
  width: number;
  height: number;
  usePNG: boolean;
}

const ICON_SIZES: IconSize[] = [
  { width: 16, height: 16, usePNG: false },
  { width: 32, height: 32, usePNG: false },
  { width: 48, height: 48, usePNG: false },
  { width: 64, height: 64, usePNG: false },
  { width: 128, height: 128, usePNG: true },
  { width: 256, height: 256, usePNG: true }
];

function App() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [optimizedForWindows, setOptimizedForWindows] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((inputFiles: FileList | null) => {
    if (!inputFiles) return;

    const newFiles = Array.from(inputFiles)
      .filter(file => file.type.includes('png'))
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
        optimized: false
      }));

    if (newFiles.length === 0) {
      setError('Veuillez sélectionner uniquement des fichiers PNG');
      return;
    }

    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const createIconHeader = (numImages: number) => {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint16(0, 0, true); // Reserved. Must be 0
    view.setUint16(2, 1, true); // Image type: 1 = ICO
    view.setUint16(4, numImages, true); // Number of images
    return buffer;
  };

  const createIconDirectoryEntry = (width: number, height: number, size: number, offset: number) => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint8(0, width === 256 ? 0 : width); // Width (0 means 256)
    view.setUint8(1, height === 256 ? 0 : height); // Height (0 means 256)
    view.setUint8(2, 0); // Color palette
    view.setUint8(3, 0); // Reserved
    view.setUint16(4, 1, true); // Color planes
    view.setUint16(6, 32, true); // Bits per pixel
    view.setUint32(8, size, true); // Image size in bytes
    view.setUint32(12, offset, true); // Offset to image data
    return buffer;
  };

  const createBMPHeader = (width: number, height: number) => {
    const buffer = new ArrayBuffer(40); // BITMAPINFOHEADER size
    const view = new DataView(buffer);
    view.setUint32(0, 40, true); // Header size
    view.setInt32(4, width, true); // Width
    view.setInt32(8, height * 2, true); // Height (doubled for ICO format)
    view.setUint16(12, 1, true); // Planes
    view.setUint16(14, 32, true); // Bits per pixel
    view.setUint32(16, 0, true); // Compression (0 = none)
    view.setUint32(20, 0, true); // Image size (0 for uncompressed)
    view.setInt32(24, 0, true); // X pixels per meter
    view.setInt32(28, 0, true); // Y pixels per meter
    view.setUint32(32, 0, true); // Colors used
    view.setUint32(36, 0, true); // Important colors
    return buffer;
  };

  const resizeImage = async (img: HTMLImageElement, width: number, height: number, usePNG: boolean): Promise<ArrayBuffer> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    if (!ctx) throw new Error('Impossible de créer le contexte 2D');

    // Enable transparency and set background to transparent
    ctx.clearRect(0, 0, width, height);
    
    // Maintain aspect ratio
    const scale = Math.min(width / img.width, height / img.height);
    const x = (width - img.width * scale) / 2;
    const y = (height - img.height * scale) / 2;

    // Draw image with high quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    if (!usePNG) {
      // For BMP format, we need to:
      // 1. Create BMP header
      // 2. Convert RGBA to BGRA
      // 3. Flip image vertically (BMP is bottom-up)
      const headerSize = 40; // BITMAPINFOHEADER
      const pixelDataSize = width * height * 4;
      const buffer = new ArrayBuffer(headerSize + pixelDataSize);
      const view = new Uint8Array(buffer);

      // Copy BMP header
      const header = new Uint8Array(createBMPHeader(width, height));
      view.set(header, 0);

      // Convert and flip image data
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sourceOffset = (y * width + x) * 4;
          const targetOffset = headerSize + ((height - 1 - y) * width + x) * 4;

          // RGBA to BGRA
          view[targetOffset] = data[sourceOffset + 2]; // B
          view[targetOffset + 1] = data[sourceOffset + 1]; // G
          view[targetOffset + 2] = data[sourceOffset]; // R
          view[targetOffset + 3] = data[sourceOffset + 3]; // A
        }
      }

      return buffer;
    } else {
      // For PNG format, return as is
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              blob.arrayBuffer().then(resolve).catch(reject);
            } else {
              reject(new Error('La conversion a échoué'));
            }
          },
          'image/png'
        );
      });
    }
  };

  const convertToIco = async (file: FileWithPreview): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const iconSizes = optimizedForWindows ? ICON_SIZES : [{ width: 256, height: 256, usePNG: true }];
          const imageBuffers: { size: IconSize; buffer: ArrayBuffer }[] = [];

          // Generate all required sizes
          for (const size of iconSizes) {
            const buffer = await resizeImage(img, size.width, size.height, size.usePNG);
            imageBuffers.push({ size, buffer });
          }

          // Calculate total size and create buffers
          const headerSize = 6;
          const dirEntrySize = 16;
          const dirEntriesSize = iconSizes.length * dirEntrySize;
          
          let offset = headerSize + dirEntriesSize;
          const totalSize = imageBuffers.reduce((sum, { buffer }) => sum + buffer.byteLength, offset);
          
          const finalBuffer = new ArrayBuffer(totalSize);
          const finalArray = new Uint8Array(finalBuffer);

          // Write header
          const headerBuffer = createIconHeader(iconSizes.length);
          finalArray.set(new Uint8Array(headerBuffer), 0);

          // Write directory entries
          let currentOffset = offset;
          imageBuffers.forEach(({ size, buffer }, index) => {
            const entry = createIconDirectoryEntry(
              size.width,
              size.height,
              buffer.byteLength,
              currentOffset
            );
            finalArray.set(new Uint8Array(entry), headerSize + (index * dirEntrySize));
            currentOffset += buffer.byteLength;
          });

          // Write image data
          imageBuffers.forEach(({ buffer }, index) => {
            const imageData = new Uint8Array(buffer);
            const imageOffset = offset + imageBuffers
              .slice(0, index)
              .reduce((sum, { buffer }) => sum + buffer.byteLength, 0);
            finalArray.set(imageData, imageOffset);
          });

          resolve(new Blob([finalBuffer], { type: 'image/x-icon' }));
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error('Impossible de charger l\'image'));
      img.src = file.preview;
    });
  };

  const downloadSingleFile = async (file: FileWithPreview) => {
    try {
      const blob = await convertToIco(file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.file.name.replace('.png', '')}.ico`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Erreur lors de la conversion de ${file.file.name}`);
    }
  };

  const downloadAsZip = async () => {
    if (files.length === 0) return;
    setIsConverting(true);
    setError(null);

    try {
      const zip = new JSZip();
      const promises = files.map(async (file) => {
        try {
          const blob = await convertToIco(file);
          zip.file(`${file.file.name.replace('.png', '')}.ico`, blob);
        } catch (err) {
          throw new Error(`Échec de la conversion de ${file.file.name}`);
        }
      });

      await Promise.all(promises);
      
      const date = new Date();
      const formattedDate = date.toLocaleDateString('fr-FR').replace(/\//g, '-');
      const formattedTime = date.toLocaleTimeString('fr-FR').replace(/:/g, '-');
      const fileName = `icons_${files.length}_${formattedDate}_${formattedTime}.zip`;

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la conversion des fichiers');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white overflow-hidden relative">
      {/* Animated background */}
      <div className="fixed inset-0 bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] from-blue-900 via-purple-900 to-blue-900 opacity-50 animate-pulse-slow"></div>
      
      <div className="relative z-10 container mx-auto px-4 py-8 min-h-screen flex flex-col">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500">
            Convertisseur PNG vers ICO
          </h1>
          <p className="text-xl text-gray-300">
            Convertissez vos images PNG en format ICO avec des fonctionnalités avancées
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="flex items-center justify-center w-full max-w-4xl mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={optimizedForWindows}
                onChange={(e) => setOptimizedForWindows(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-300 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Optimisé pour Windows (multi-résolutions)
              </span>
            </label>
          </div>

          <div 
            className={`gradient-border w-full max-w-4xl transition-all duration-300 ${
              isDragging ? 'scale-105' : ''
            }`}
          >
            <div
              className={`w-full bg-gray-900/80 backdrop-blur-xl rounded-xl p-8 transition-all duration-300`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
                accept=".png"
                multiple
                className="hidden"
              />

              <div className="text-center">
                {files.length === 0 ? (
                  <div className="space-y-4 py-12">
                    <Upload className="w-16 h-16 mx-auto text-blue-400 animate-bounce" />
                    <div>
                      <p className="text-xl text-gray-300">
                        Déposez vos fichiers PNG ici ou cliquez pour parcourir
                      </p>
                      <p className="text-sm text-gray-400 mt-2">
                        Supporte plusieurs fichiers et la transparence
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file, index) => (
                      <div
                        key={file.preview}
                        className="relative group"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative bg-gray-800 rounded-lg p-4">
                          <img
                            src={file.preview}
                            alt="Aperçu"
                            className="w-full h-32 object-contain rounded-lg mb-2"
                          />
                          <p className="text-sm text-gray-300 truncate">
                            {file.file.name}
                          </p>
                          <div className="absolute top-2 right-2 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadSingleFile(file);
                              }}
                              className="p-1 rounded-full bg-gray-700 hover:bg-blue-600 transition-colors"
                              title="Télécharger"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="p-1 rounded-full bg-gray-700 hover:bg-red-600 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 p-4 bg-red-900/20 rounded-lg animate-pulse">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="flex gap-4">
              <button
                onClick={downloadAsZip}
                disabled={isConverting}
                className={`
                  relative overflow-hidden px-8 py-4 rounded-full font-medium text-lg
                  transition-all duration-300 transform hover:scale-105
                  bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white
                  ${isConverting ? 'opacity-75 cursor-not-allowed' : ''}
                `}
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-5 h-5" />
                  {isConverting ? 'Conversion en cours...' : 'Télécharger en ZIP'}
                </div>
                <div className="shine-effect absolute inset-0"></div>
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 text-gray-400 flex-wrap">
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              <p className="text-sm">Support PNG</p>
            </div>
            <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
            <p className="text-sm">Transparence 32 bits</p>
            <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
            <p className="text-sm">Multi-résolutions</p>
            <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
            <p className="text-sm">Compression PNG</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;