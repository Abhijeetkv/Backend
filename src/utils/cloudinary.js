import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();  // Load environment variables from a .env file

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        // Upload file to Cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        // File uploaded successfully
        // console.log("File is uploaded on Cloudinary", response.url);
        // return response;
        fs.unlinkSync(localFilePath);  // Remove the locally saved temporary file
        return response;

    } catch (error) {
        console.error("Error uploading file to Cloudinary:", error);
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);  // Remove the locally saved temporary file if it exists
        }
        return null;
    }
};

export { uploadOnCloudinary };
