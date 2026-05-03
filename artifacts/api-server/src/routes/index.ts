import { Router, type IRouter } from "express";
import healthRouter from "./health";
import protocolRouter from "./protocol";
import dashboardRouter from "./internal/dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(protocolRouter);
router.use("/internal/dashboard", dashboardRouter);

export default router;
