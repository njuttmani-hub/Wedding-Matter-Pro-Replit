import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weddingRouter from "./wedding";

const router: IRouter = Router();

router.use(healthRouter);
router.use(weddingRouter);

export default router;
