import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";



const generateAccessAndRefreshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}
const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: email, username
    // check for images, check for avatar
    // upload them on cloudinary,avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response


    const {fullName, userName, email, password} = req.body;
    // console.log("email", email);
    
    if (
        [fullName, userName, email, password].some((field) => field?.trim() === "")
    ) {
            throw new ApiError(400, "Please fill in all fields");
    }

    const existedUser = await User.findOne({
        $or: [{ userName }, { email }],
    })
    
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }
    
    console.log(req.files);
    

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Please provide an avatar");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(500, "avatar is required");
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase(),
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
    
})




const loginUser = asyncHandler(async (req, res) => {
   // req body -> data
   // username or email
   // find the user
   // password check
   // access and refresh token 
   // send cookie

   const {email, userName, password} = req.body;

   if(!email && !userName) {
       throw new ApiError(400, "Please provide email or username");
   }

   // here is an alternate of above code based on logic discussed below
//    if ( !(userName || email)) {
//          throw new ApiError(400, "Please provide email or username");
//    }

   const user = await User.findOne({
         $or: [{email}, {userName}],
   })

   if(!user) {
       throw new ApiError(404, "User not found");
   }

   const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid) {
         throw new ApiError(401, "Invalid user credentials");
    }

       // Generate tokens
       const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

       const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
   
       const options = {
           httpOnly: true,
           secure: true,
       };
   
       // Respond with tokens and user data
       return res
           .status(200)
           .cookie("accessToken", accessToken, options)
           .cookie("refreshToken", refreshToken, options)
           .json(
               new ApiResponse(
                200, 
                {
                   user: loggedInUser,
                   accessToken,
                   refreshToken,
               }, "User logged in successfully")
           );
   });
   



const logoutUser = asyncHandler(async (req, res) => {
        await User.findByIdAndUpdate(

            req.user._id,
            {
                 $set: { refreshToken: undefined } 
            },
            { 
                new: true
            }
        )

        const options = {
            httpOnly: true,
            secure: true,
        }

        return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"))
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        return res.status(401).json(new ApiError(401, "Unauthorized request"));
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            return res.status(401).json(new ApiError(401, "Invalid refresh token"));
        }

        // Check if the incoming refresh token matches the one stored in the user's document
        if (incomingRefreshToken !== user?.refreshToken) {
            return res.status(401).json(new ApiError(401, "Refresh token is expired or used"));
        }

        // Generate new access and refresh tokens
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

        // Update the refreshToken in the database
        user.refreshToken = newRefreshToken;
        await user.save();

        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        return res.status(401).json(new ApiError(401, error?.message || "Invalid refresh token"));
    }
});


const changeCurrentPassword = asyncHandler(async (req, res) => { 
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
 
    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({
        validateBeforeSave: false,
    })

    return res
    .status(200)
    .json(
        new ApiResponse(200, {}, "Password changed successfully")
    )
})


const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(200, req.user, "User details fetched successfully")
})


const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName, userName, email} = req.body;

    if(!fullName || !userName || !email) {
        throw new ApiError(400, "Please provide all fields");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                userName: userName.toLowerCase(),
                email: email
            }

        },
        { new: true }
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Account details updated successfully")
    )
 })


 const updateUserAvatar = asyncHandler(async (req, res) => {

    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Please provide an avatar");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "Something went wrong while uploading the avatar");
    }


    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }

    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated successfully")
    )
 })


 const updateUserCoverImage = asyncHandler(async (req, res) => {

    const CoverImageLocalPath = req.file?.path;

    if (!CoverImageLocalPath) {
        throw new ApiError(400, "Please provide an cover");
    }

    const coverImage = await uploadOnCloudinary(CoverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "Something went wrong while uploading the cover image");
    }


    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }

    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
 })


 const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { userName } = req.params;

    if (!userName?.trim()) {
        throw new ApiError(400, "Please provide a username");
    }

    const channel = await User.aggregate([
        {
            $match: {
                userName: userName?.toLowerCase(),
            }
        },

        {
            $lookup : {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
            }
        },

        {
            $lookup : {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo",
            }
        },

        {
            $addFields: {
                subscribersCount : {
                    $size: "$subscribers"
                },

                channelSubscribedToCount: {
                    $size: "$subscribedTo"
                },

                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },

        {
            $project: {
                fullName: 1,
                userName: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            }
        }
    ])

    if (!channel?.length) {
        throw new ApiError(404, "Channel not found");
    }   
    
    
    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "Channel profile fetched successfully"
        ))

 })

 const getWatchHistory = asyncHandler(async (req, res) => { 
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id),
            }
        },
        {
            $lookup: {
                from : "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        userName: 1,    
                                        avatar: 1,
                                    }
                                }
                            ]

                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            uaer[0].WatchHistory,
            "Watch history fetched successfully"
        )
    )
 })
    

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
    
}