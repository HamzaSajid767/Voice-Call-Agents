import {
  deleteUserByAdmin,
  listUsersForAdmin,
  updateUserByAdmin,
} from '../services/adminUserService.js';

const listUsers = async (req, res) => {
  const query = req.validated?.query ?? req.query;
  const result = await listUsersForAdmin(query);
  return res.status(200).json(result);
};

const updateUser = async (req, res) => {
  const { id } = req.validated.params;
  const body = req.validated.body;
  const result = await updateUserByAdmin(id, body);
  return res.status(200).json(result);
};

const deleteUser = async (req, res) => {
  const { id } = req.validated.params;
  await deleteUserByAdmin(id, req.user.id.toString());
  return res.status(204).send();
};

export { listUsers, updateUser, deleteUser };
