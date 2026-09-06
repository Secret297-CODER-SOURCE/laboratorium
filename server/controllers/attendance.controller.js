import * as attendanceService from '../services/attendance.service.js';

export async function getGroupOverview(req, res) {
  const groupId = req.params.groupId && req.params.groupId !== 'all' ? parseInt(req.params.groupId, 10) : null;
  const conferences = attendanceService.getGroupAttendanceOverview(req.user.id, req.user.role, {
    groupId,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ conferences });
}

export async function getConferenceAttendance(req, res) {
  const data = attendanceService.getConferenceAttendance(
    parseInt(req.params.id, 10),
    req.user.id,
    req.user.role,
  );
  res.json(data);
}
