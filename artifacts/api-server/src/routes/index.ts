import { Router, type IRouter } from "express";
import healthRouter from "./health";
import protocolRouter from "./protocol";
import inquiriesRouter from "./inquiries";
import webhooksRouter from "./webhooks";
import dashboardRouter from "./internal/dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(protocolRouter);
router.use(inquiriesRouter);
router.use(webhooksRouter);
router.use("/internal/dashboard", dashboardRouter);

export default router;
