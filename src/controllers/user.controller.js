import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateAccessAndRefreshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
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


export {
    registerUser,
    loginUser,
    logoutUser
}