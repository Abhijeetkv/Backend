import { Router } from "express";
import { registerUser } from "../controllers/user.controller.js";
import { upload} from "../middlewares/upload.middleware.js";

const router = Router();

router.route("/register").post(
    upload.field([
        {
            name: "avatar",
            maxcount: 1
        },
        {
            name: "coverImage",
            maxcount: 1
        }
    ]),
    registerUser
);


export default router;