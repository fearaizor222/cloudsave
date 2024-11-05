import * as path from "node:path";
import { google } from "npm:googleapis";
import * as fs from "node:fs";
import { Buffer } from "node:buffer";
import { Presets, SingleBar } from "npm:cli-progress";
import progress from "npm:progress-stream";

const rootFolderId = fs.readFileSync("cloudsave.init").toString().trim();

const getDriveService = () => {
  const KEY_CONTENT = fs.readFileSync('authentication.json');
  const SCOPES = ["https://www.googleapis.com/auth/drive"];

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(KEY_CONTENT.toString()),
    scopes: SCOPES,
  });
  const driveService = google.drive({ version: "v3", auth });
  return driveService;
};

const uploadFile = async (
  filePath: string,
  folderId: string,
  mime: string = "application/zip",
): Promise<string> => {
  const driveService = getDriveService();
  const fileName = path.basename(filePath);

  const existingFiles = await findFileByName(fileName, folderId);
  if (existingFiles && existingFiles.length > 0) {
    // console.log("File already exists. Deleting the existing file.");
    await deleteFile(existingFiles[0].id!);
  }

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const fileSize = fs.statSync(filePath).size;
  const progressStream = progress({
    length: fileSize,
    time: 100, /* ms */
  });

  const bar = new SingleBar({}, Presets.shades_classic);
  bar.start(fileSize, 0);

  // deno-lint-ignore no-explicit-any
  progressStream.on("progress", (progress: { transferred: any }) => {
    bar.update(progress.transferred);
  });

  const media = {
    mimeType: mime,
    body: fs.createReadStream(filePath).pipe(progressStream),
  };

  try {
    const response = await driveService.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, mimeType, parents",
    });
    // console.log(`File uploaded successfully. File ID: ${response.data.id}`);

    return response.data.id!;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  } finally {
    bar.stop();
  }
};

const deleteFile = async (fileId: string) => {
  const driveService = getDriveService();
  try {
    await driveService.files.delete({ fileId });
    // console.log(`File deleted successfully: ${fileId}`);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
};

const downloadFile = async (fileId: string) => {
  const driveService = getDriveService();
  try {
    // Get file metadata to determine the file size
    const fileMetadata = await driveService.files.get({
      fileId: fileId,
      fields: "size",
    });

    const fileSize = parseInt(fileMetadata.data.size ?? "0", 10);

    const bar = new SingleBar({}, Presets.shades_classic);
    const progressing = progress({
      length: fileSize,
      time: 100, /* ms */
    });

    // deno-lint-ignore no-explicit-any
    progressing.on("progress", (progress: { transferred: any }) => {
      bar.update(progress.transferred);
    });

    bar.start(fileSize, 0);

    const response = await driveService.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" },
    );

    const chunks: Buffer[] = [];
    response.data
      .pipe(progressing)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => {
        bar.stop();
        // console.log('Download complete.');
      });

    return new Promise<Buffer>((resolve, reject) => {
      response.data.on("end", () => resolve(Buffer.concat(chunks)));
      response.data.on("error", (error) => {
        console.error("Error downloading file:", error);
        reject(error);
      });
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    throw error;
  }
};

const createFolder = async (
  folderName: string,
  folderParent: string,
): Promise<string> => {
  const driveService = getDriveService();
  const fileMetadata = {
    name: folderName,
    parents: [folderParent],
    mimeType: "application/vnd.google-apps.folder",
  };

  try {
    const response = await driveService.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });
    // console.log(`Folder created successfully. Folder ID: ${response.data.id}`);
    return response.data.id!;
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
};

const listFolder = async (folderId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id, name, mimeType)",
    });
    // console.log("Children of Folder:", response.data.files);
    return response.data.files;
  } catch (error) {
    console.error("Error listing children of folder:", error);
    throw error;
  }
};

const getFileMetadata = async (fileId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.get({
      fileId: fileId,
      fields: "id, name, mimeType, size, parents",
    });
    return response.data;
  } catch (error) {
    console.error("Error getting file metadata:", error);
    throw error;
  }
};

const getFolderMetadata = async (folderId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, size, parents",
    });
    
    return response.data;
  } catch (error) {
    console.error("Error getting folder metadata:", error);
  }
};

const getFileContent = async (fileId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "text" },
    );
    // console.log(await getFileMetadata(fileId));
    return response.data;
  } catch (error) {
    console.error("Error getting file content:", error);
    throw error;
  }
};

const listChildrenOfFolder = async (folderId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name, mimeType)",
    });
    return response.data.files;
  } catch (error) {
    console.error("Error listing children of folder:", error);
    throw error;
  }
};

const findFileByName = async (fileName: string, folderId: string) => {
  const driveService = getDriveService();
  try {
    const response = await driveService.files.list({
      q: `'${folderId}' in parents and name='${fileName}'`,
      fields: "files(id, name)",
    });
    return response.data.files;
  } catch (error) {
    console.error("Error finding file by name:", error);
    throw error;
  }
};

export {
  createFolder,
  deleteFile,
  downloadFile,
  findFileByName,
  getFileContent,
  getFileMetadata,
  getFolderMetadata,
  listChildrenOfFolder,
  listFolder,
  uploadFile,
  rootFolderId,
};
